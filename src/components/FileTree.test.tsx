import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import FileTree from './FileTree';
import { orderReviewFiles } from '../review';
import type { ChangedFile, ReviewPlanItem } from '../types';

it('keeps the numbered flow across priorities and folders, with per-file explanations and badges',()=>{
  const files=['z/entry.ts','a/service.ts'].map(path=>({path,status:'M',additions:1,deletions:0,signature:path} as ChangedFile));
  const plan:Record<string,ReviewPlanItem>={
    'z/entry.ts':{order:1,priority:'low',summary:'Точка входа: передаёт запрос в сервис.',reason:'Проверить параметры.',author:'Agent'},
    'a/service.ts':{order:2,priority:'validate',summary:'Сервис сохраняет результат.',reason:'Проверить запись.',author:'Agent'},
  };
  for(const flat of [true,false]) {
    const html=renderToStaticMarkup(<FileTree files={orderReviewFiles(files,plan)} plan={plan} selected="z/entry.ts" reviewed={{}} flat={flat} filtering={false} onSelect={()=>{}} onStage={()=>{}} onCollapseChange={()=>{}}/>);
    expect(html.indexOf('Review step 1')).toBeLessThan(html.indexOf('Review step 2'));
    expect(html).toContain('Точка входа: передаёт запрос в сервис.');
    expect(html).toContain('aria-label="Needs validation"');
    expect(html).toContain('aria-label="Lower priority"');
    expect(html).not.toContain('group-validate');
  }
});
