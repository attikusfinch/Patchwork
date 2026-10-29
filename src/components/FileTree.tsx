import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { ArrowDown, Check, ChevronDown, ChevronRight, FileCode2, FileJson2, FileText, Folder, FolderOpen, Image as ImageIcon, Minus, Plus, ShieldCheck } from 'lucide-react';
import type { ChangedFile, ReviewPlanItem } from '../types';
import { reviewOrder } from '../review';

export function FileIcon({path,size=15}: {path:string;size?:number}) {
  if (/\.(png|jpe?g|webp)$/i.test(path)) return <ImageIcon size={size} className="file-icon text"/>;
  if (path.endsWith('.json')) return <FileJson2 size={size} className="file-icon json"/>;
  if (/\.(md|txt)$/.test(path)) return <FileText size={size} className="file-icon text"/>;
  return <FileCode2 size={size} className={`file-icon ${/\.(ts|tsx)$/.test(path)?'typescript':/\.(rs)$/.test(path)?'rust':''}`}/>;
}

interface Node {name:string;path:string;file?:ChangedFile;children:Map<string,Node>}
interface Props {
  files:ChangedFile[]; selected:string; reviewed:Record<string,string>; plan:Record<string,ReviewPlanItem>; flat:boolean; filtering:boolean;
  onSelect:(path:string)=>void; onStage:(path:string,staged:boolean)=>void;
  onCollapseChange:(collapsed:boolean)=>void;
}
export interface FileTreeHandle {collapseAll:()=>void;expandAll:()=>void}
function buildTree(files:ChangedFile[]):Node {
    const root:Node={name:'',path:'',children:new Map()};
    for(const file of files) {
      let current=root;
      file.path.split('/').forEach((part,i,parts)=>{
        const path=parts.slice(0,i+1).join('/');
        if(!current.children.has(part))current.children.set(part,{name:part,path,children:new Map()});
        current=current.children.get(part)!;
        if(i===parts.length-1)current.file=file;
      });
    }
    return root;
}
export default memo(forwardRef<FileTreeHandle,Props>(function FileTree({files,selected,reviewed,plan,flat,filtering,onSelect,onStage,onCollapseChange},ref) {
  const [collapsed,setCollapsed]=useState<Set<string>>(new Set());
  const groups=useMemo(()=>{
    if(!files.some(file=>plan[file.path]))return [{key:'all',label:'',files,tree:buildTree(flat?[]:files)}];
    return [
      {key:'ordered',label:'Review order'},
      {key:'other',label:files.some(file=>reviewOrder(plan[file.path])!==undefined)?'Other files':''},
    ].map(group=>{
      const grouped=files.filter(f=>group.key==='ordered'?reviewOrder(plan[f.path])!==undefined:
        reviewOrder(plan[f.path])===undefined);
      return {...group,files:grouped,tree:buildTree(flat||group.key==='ordered'?[]:grouped)};
    }).filter(group=>group.files.length);
  },[files,plan,flat]);
  const folderKeys=useMemo(()=>{
    const keys:string[]=[];
    function collect(node:Node,group:string) {
      for(const child of node.children.values())if(!child.file){keys.push(`${group}/${child.path}`);collect(child,group);}
    }
    for(const group of groups)collect(group.tree,group.key);
    return keys;
  },[groups]);
  useImperativeHandle(ref,()=>({
    collapseAll:()=>setCollapsed(prev=>new Set([...prev,...folderKeys])),
    expandAll:()=>setCollapsed(prev=>new Set([...prev].filter(key=>!folderKeys.includes(key)))),
  }),[folderKeys]);
  const allCollapsed=folderKeys.length>0&&folderKeys.every(key=>collapsed.has(key));
  useEffect(()=>{onCollapseChange(allCollapsed)},[allCollapsed,onCollapseChange]);
  function toggle(key:string) {setCollapsed(prev=>{const next=new Set(prev);if(next.has(key))next.delete(key);else next.add(key);return next;})}
  function fileRow(file:ChangedFile,depth:number,flat=false) {
    const name=file.path.split('/').at(-1)!;
    const directory=file.path.slice(0,-name.length-1);
    const item=plan[file.path];
    const order=reviewOrder(item);
    const description=[file.originalPath?`${file.originalPath} → ${file.path}`:file.path,
      order!==undefined?`Review step ${order}`:null,
      item?.priority==='validate'?'Needs validation':item?.priority==='low'?'Lower priority':null,
      item?.summary,item?.reason, file.binary?'Binary file':`${file.additions} lines added, ${file.deletions} removed`].filter(Boolean).join('\n');
    return <div className={`file-row ${selected===file.path?'selected':''} ${item?.summary?'has-summary':''}`} key={file.path}>
      <button className="file-select" onClick={()=>onSelect(file.path)} style={{paddingLeft:12+depth*16}} aria-current={selected===file.path?'true':undefined} title={description}>
        {order!==undefined&&<span className="review-order-number" aria-label={`Review step ${order}`}>{order}</span>}
        {order===undefined&&<FileIcon path={file.path}/>}<span className="file-name">{name}</span>
        {item?.priority==='validate'&&<ShieldCheck size={12} className="file-priority validate" aria-label="Needs validation"/>}
        {item?.priority==='low'&&<ArrowDown size={12} className="file-priority" aria-label="Lower priority"/>}
        {flat&&directory&&<span className="file-directory">{directory}</span>}
        {reviewed[file.path]&&<Check size={12} className="reviewed-icon" aria-label="Reviewed"/>}
        <span className="file-line-stats" aria-label={file.binary?'Binary file':`${file.additions} lines added, ${file.deletions} removed`}>
          {file.binary?<span>bin</span>:<><span className="added-text">+{file.additions}</span><span className="deleted-text">−{file.deletions}</span></>}
        </span>
        <span className={`file-status status-${file.status}`} aria-label={{M:'Modified',A:'Added',D:'Deleted',R:'Renamed'}[file.status]??file.status}>{file.status}</span>
        {item?.summary&&<span className="file-summary">{item.summary}</span>}
      </button>
      <button className={`file-stage ${file.staged?'is-staged':''}`} onClick={()=>onStage(file.path,!file.staged)} title={file.staged?'Unstage file':'Stage file'} aria-label={`${file.staged?'Unstage':'Stage'} ${name}`}>
        {file.staged?<Minus size={13}/>:<Plus size={13}/>}</button>
    </div>;
  }
  function nodes(node:Node,depth:number,group:string):React.ReactNode {
    return [...node.children.values()].sort((a,b)=>Number(!!a.file)-Number(!!b.file)||a.name.localeCompare(b.name)).map(child=>{
      if(child.file)return fileRow(child.file,depth);
      const key=`${group}/${child.path}`,closed=!filtering&&collapsed.has(key);
      return <div key={child.path}>
        <button className="folder-row" style={{paddingLeft:10+depth*16}} onClick={()=>toggle(key)} aria-expanded={!closed}>
          {closed?<ChevronRight size={13}/>:<ChevronDown size={13}/>}{closed?<Folder size={15}/>:<FolderOpen size={15}/>}
          <span>{child.name}</span>
        </button>
        {!closed&&nodes(child,depth+1,group)}
      </div>;
    });
  }
  if(!files.length)return <div className="no-files">No matching files.</div>;
  return <div className="file-tree">{groups.map(group=>{
    const closed=!filtering&&collapsed.has(`group/${group.key}`);
    return <section key={group.key} aria-label={group.label||'Changed files'}>
      {group.label&&<button className={`review-group group-${group.key}`} onClick={()=>toggle(`group/${group.key}`)} aria-expanded={!closed}>
        {closed?<ChevronRight size={12}/>:<ChevronDown size={12}/>}
        <span>{group.label}</span><span className="group-count">{group.files.length}</span>
      </button>}
      {!closed&&(flat||group.key==='ordered'?group.files.map(f=>fileRow(f,0,true)):nodes(group.tree,0,group.key))}
    </section>;
  })}</div>;
}));
