import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import assert from 'node:assert/strict';

// Reproducible local benchmark. All Git/review writes stay in a new .qa fixture.
// Pass one or more executables to compare installed/rebuilt versions on the same files.
const binaries=process.argv.slice(2);
if(!binaries.length)throw new Error('Usage: node scripts/benchmark-mcp.mjs <executable> [other-executable]');
const directory=path.resolve('.qa',`benchmark-${Date.now()}`);
const repository=path.join(directory,'repo');
await mkdir(repository,{recursive:true});
const git=(...args)=>execFileSync('git',['-C',repository,...args],{windowsHide:true,stdio:'pipe'});
git('init','-b','main');git('config','user.name','Patchwork benchmark');git('config','user.email','benchmark@patchwork.local');git('config','commit.gpgsign','false');git('config','core.autocrlf','false');
await writeFile(path.join(repository,'entry.ts'),'export const value = 1;\n');
git('add','.');git('commit','-m','benchmark fixture');
await writeFile(path.join(repository,'entry.ts'),'export const value = 2;\n');
await Promise.all(Array.from({length:500},(_,i)=>writeFile(path.join(repository,`new-${i}.ts`),'export const fixture = true;\n'.repeat(500))));
for(const [index,binary] of binaries.entries()) {
  const data=path.join(directory,`profile-${index}`);
  await mkdir(data,{recursive:true});
  const env={...process.env,PATCHWORK_DATA_DIR:data};
  const executable=path.resolve(binary);
  const app=spawn(executable,[],{env,windowsHide:true,stdio:'ignore'});
  let client;
  try {
    let ready=false;
    for(let i=0;i<120;i++) {
      try{await readFile(path.join(data,'bridge.json'));ready=true;break}catch{}
      if(app.exitCode!==null)throw new Error(`App exited: ${app.exitCode}`);
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.ok(ready,'MCP bridge did not start');
    // Optional common bridge isolates backend timing when comparing older transports.
    client=spawn(process.env.PATCHWORK_BENCHMARK_BRIDGE??executable,['--mcp'],{env,windowsHide:true,stdio:['pipe','pipe','inherit']});
    const pending=new Map();let sequence=0;
    createInterface({input:client.stdout}).on('line',line=>{
      const response=JSON.parse(line),item=pending.get(response.id);
      if(item){clearTimeout(item.timer);pending.delete(response.id);item.resolve(response);}
    });
    const call=(method,params)=>new Promise((resolve,reject)=>{
      const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error(`Timeout: ${method}`))},30000);
      pending.set(id,{resolve,timer});client.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
    });
    const tool=async(name,args={})=>{
      const response=await call('tools/call',{name,arguments:args});
      assert.ok(!response.error&&!response.result.isError,JSON.stringify(response));
      return JSON.parse(response.result.content[0].text);
    };
    const init=await call('initialize',{protocolVersion:'2025-11-25',clientInfo:{name:'Benchmark',version:'1'},capabilities:{}});
    await tool('open_repository',{path:repository});
    assert.equal((await tool('list_changes')).files.length,501);
    // Warm up once; medians reflect backend file reads, not frontend painting or startup.
    await tool('get_file',{path:'entry.ts'});
    const samples=[];
    for(let i=0;i<10;i++) {
      const start=performance.now();
      assert.match((await tool('get_file',{path:'entry.ts'})).after,/value = 2/);
      samples.push(performance.now()-start);
    }
    samples.sort((a,b)=>a-b);
    console.log(JSON.stringify({executable,version:init.result.serverInfo.version,changedFiles:501,
      getFileMedianMs:Math.round((samples[4]+samples[5])/2),minMs:Math.round(samples[0]),maxMs:Math.round(samples.at(-1))}));
  } finally {
    client?.stdin.end();client?.kill();app.kill();
  }
}
