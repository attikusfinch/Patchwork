import { describe, expect, it } from 'vitest';
import { orderReviewFiles } from './review';
import type { ChangedFile, ReviewPlanItem } from './types';

const file=(path:string)=>({path,signature:path} as ChangedFile);
const item=(priority:ReviewPlanItem['priority'],order?:number):ReviewPlanItem=>({priority,order,reason:'Follow the call',author:'Agent'});

describe('guided review order',()=>{
  it('follows execution order across priorities and leaves unnumbered files afterwards',()=>{
    const files=['z-entry','a-service','urgent','routine','docs'].map(file);
    const plan={'z-entry':item('low',1),'a-service':item('validate',2),urgent:item('validate'),docs:item('low')};
    expect(orderReviewFiles(files,plan).map(f=>f.path)).toEqual(['z-entry','a-service','urgent','routine','docs']);
    expect(files.map(f=>f.path)).toEqual(['z-entry','a-service','urgent','routine','docs']);
  });
  it('keeps legacy priority-only plans and unspecified files usable',()=>{
    expect(orderReviewFiles(['docs','z','entry','a'].map(file),{entry:item('validate'),docs:item('low')}).map(f=>f.path)).toEqual(['entry','a','z','docs']);
  });
  it('keeps step numbers stable when files disappear or filtering leaves gaps',()=>{
    const plan={entry:item('normal',1),removed:item('normal',2),test:item('normal',3)};
    expect(orderReviewFiles(['test','entry'].map(file),plan).map(f=>[f.path,plan[f.path as keyof typeof plan].order])).toEqual([['entry',1],['test',3]]);
  });
});
