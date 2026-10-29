import { fingerprint, linesFor } from './diff';
import type { FileContent, Snapshot, Review } from './types';

const beforeServer = `import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { getRepository } from '../git/repository';
import { getChanges } from '../git/changes';
import { getFileDiff } from '../git/diff';

const server = new Server(
  { name: 'orbit', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

// A small bridge between your agent and your workspace.
// All paths are relative to the active repository.

const fileSchema = z.object({
  path: z.string().min(1),
  base: z.string().default('HEAD'),
});

export async function listChanges() {
  const repository = await getRepository();
  const changes = await getChanges(repository);

  return {
    content: [{ type: 'text', text: JSON.stringify(changes) }],
  };
}

export async function readDiff(input: unknown) {
  const { path, base } = fileSchema.parse(input);
  const repository = await getRepository();
  const diff = await getFileDiff(repository, path, base);

  return {
    content: [{ type: 'text', text: diff }],
  };
}

const tools = {
  list_changes: listChanges,
  read_diff: readDiff,
};

export async function handleTool(name: string, args: unknown) {
  const handler = tools[name as keyof typeof tools];

  if (!handler) {
    throw new Error('Unknown tool: ' + name);
  }

  return handler(args);
}

export async function startServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
`;

const afterServer = beforeServer
  .replace("import { getFileDiff } from '../git/diff';", "import { getFileDiff } from '../git/diff';\nimport { openReview } from '../review/workspace';\nimport { getReviewComments } from '../review/comments';")
  .replace("base: z.string().default('HEAD'),", "base: z.string().default('main'),\n  line: z.number().int().positive().optional(),")
  .replace('const tools = {', `// Bring the human directly to the change that needs attention.
export async function showDiff(input: unknown) {
  const { path, base, line } = fileSchema.parse(input);
  const repository = await getRepository();

  await openReview({ repository, path, base, line });

  return {
    content: [{ type: 'text', text: 'Review opened in Patchwork.' }],
  };
}

export async function readFeedback() {
  const comments = await getReviewComments();

  return {
    content: [{ type: 'text', text: JSON.stringify(comments) }],
  };
}

const tools = {`)
  .replace('  read_diff: readDiff,', '  read_diff: readDiff,\n  show_diff: showDiff,\n  get_review: readFeedback,');

export const demoFiles: Record<string, FileContent> = {
  ...Object.fromEntries((['png','jpg','webp'] as const).map(extension=>{
    const path=`assets/preview.${extension}`;
    const mime=extension==='jpg'?'image/jpeg':`image/${extension}`;
    const sizes={png:[17977,18261],jpg:[40359,43479],webp:[6242,6486]}[extension];
    return [path,{path,before:'',after:'',binary:true,language:extension,images:{
      before:{dataUrl:`/demo/before.${extension}`,mime,bytes:sizes[0],error:null},
      after:{dataUrl:`/demo/after.${extension}`,mime,bytes:sizes[1],error:null},
    }}];
  })),
  'src/mcp/server.ts': { path:'src/mcp/server.ts', before:beforeServer, after:afterServer, binary:false, language:'ts' },
  'src/mcp/tools.ts': { path:'src/mcp/tools.ts', before:`export const tools = ['list_changes', 'read_diff'];\n`, after:`export const tools = [\n  'list_changes',\n  'read_diff',\n  'show_diff',\n  'get_review',\n] as const;\n\nexport type ToolName = (typeof tools)[number];\n`, binary:false, language:'ts' },
  'src/review/comments.ts': { path:'src/review/comments.ts', before:'', after:`import type { ReviewComment } from '../types/review';\n\nconst comments = new Map<string, ReviewComment[]>();\n\nexport async function getReviewComments(): Promise<ReviewComment[]> {\n  return [...comments.values()].flat();\n}\n\nexport async function addComment(comment: ReviewComment) {\n  const existing = comments.get(comment.path) ?? [];\n  comments.set(comment.path, [...existing, comment]);\n}\n`, binary:false, language:'ts' },
  'src/review/workspace.ts': { path:'src/review/workspace.ts', before:`export function openReview(path: string) {\n  window.dispatchEvent(new CustomEvent('review', { detail: path }));\n}\n`, after:`interface ReviewContext {\n  repository: string;\n  path: string;\n  base: string;\n  line?: number;\n}\n\nexport async function openReview(context: ReviewContext) {\n  window.dispatchEvent(new CustomEvent('review:open', {\n    detail: context,\n  }));\n}\n`, binary:false, language:'ts' },
  'src/types/review.ts': { path:'src/types/review.ts', before:'', after:`export interface ReviewComment {\n  id: string;\n  path: string;\n  line: number;\n  side: 'before' | 'after';\n  body: string;\n  author: string;\n  createdAt: number;\n}\n\nexport interface ReviewState {\n  reviewed: Record<string, string>;\n  comments: ReviewComment[];\n}\n`, binary:false, language:'ts' },
  'tests/mcp.test.ts': { path:'tests/mcp.test.ts', before:`import { expect, it } from 'vitest';\nimport { listChanges } from '../src/mcp/server';\n\nit('lists repository changes', async () => {\n  const result = await listChanges();\n  expect(result.content).toHaveLength(1);\n});\n`, after:`import { expect, it } from 'vitest';\nimport { listChanges, showDiff } from '../src/mcp/server';\n\nit('lists repository changes', async () => {\n  const result = await listChanges();\n  expect(result.content).toHaveLength(1);\n});\n\nit('opens a review at the requested line', async () => {\n  const result = await showDiff({ path: 'src/mcp/server.ts', line: 24 });\n  expect(result.content[0].text).toBe('Review opened in Patchwork.');\n});\n`, binary:false, language:'ts' },
  'package.json': { path:'package.json', before:'{\n  "name": "orbit",\n  "version": "0.1.0",\n  "scripts": {\n    "dev": "vite",\n    "test": "vitest"\n  }\n}\n', after:'{\n  "name": "orbit",\n  "version": "0.2.0",\n  "scripts": {\n    "dev": "vite",\n    "test": "vitest",\n    "mcp": "tsx src/mcp/server.ts"\n  }\n}\n', binary:false, language:'json' },
  'README.md': { path:'README.md', before:'# Orbit\n\nYour local development workspace.\n\n## Getting started\n\nRun `npm install` and `npm run dev`.\n', after:'# Orbit\n\nYour local development workspace, connected to your agent.\n\n## Getting started\n\nRun `npm install` and `npm run dev`.\n\n## Agent reviews\n\nConnect the MCP server to your coding agent. Use `show_diff` to open\na change in Patchwork, then `get_review` to read human feedback.\n\nEvery review stays local to your machine.\n', binary:false, language:'md' },
};

export function demoSnapshot(base = 'working'): Snapshot {
  return { root:'demo://orbit', name:'orbit', branch:'feat/agent-review', branches:['main','develop','feat/agent-review'], base,
    baseCommit:'9a71c4b', stagedCount:2,
    files: Object.values(demoFiles).map((f,i) => {
      const lines = linesFor(f.before, f.after);
      return {path:f.path, originalPath:null, status:f.before||f.images?.before ? 'M' : 'A',
        additions:lines.filter(l=>l.kind==='add').length, deletions:lines.filter(l=>l.kind==='delete').length,
        binary:f.binary, staged:i===4 || i===7,signature:fingerprint(f.images?.before?.dataUrl??f.before,f.images?.after?.dataUrl??f.after)};
    }) };
}
export const emptyReview: Review = {reviewed:{},comments:[],plan:{}};
export const demoReview: Review = {
  ...emptyReview,
  summary:'Задача: дать агенту возможность открыть нужный diff и получить обратную связь. Сначала запрос проходит через MCP-сервер, затем передаёт контекст в окно ревью. Комментарии возвращаются агенту через get_review. После этой цепочки проверяем типы, регистрацию инструментов, тесты и запуск. Последние шаги — документация и образцы изображений.',
  plan: {
    'src/mcp/server.ts': {priority:'validate',order:1,summary:'Точка входа — showDiff. Функция проверяет path, base и line, получает репозиторий и передаёт контекст в openReview. Новый readFeedback возвращает комментарии агенту. Далее смотрим, как openReview открывает ревью.',reason:'Проверьте обработку некорректных аргументов и смену базы по умолчанию с HEAD на main.',author:'Demo agent'},
    'src/review/workspace.ts': {priority:'validate',order:2,summary:'openReview теперь принимает не только путь, но и репозиторий, базу сравнения и строку. Контекст отправляется в событии review:open. После открытия файла человек оставляет комментарии — их хранение разбираем следующим шагом.',reason:'Убедитесь, что получатель слушает новое имя события и использует все поля контекста.',author:'Demo agent'},
    'src/review/comments.ts': {priority:'validate',order:3,summary:'addComment складывает комментарии в Map по пути файла, getReviewComments собирает их в общий массив для агента. Хранилище находится только в памяти. Дальше проверяем структуру самого комментария.',reason:'Здесь нет сохранения на диск и разделения по репозиториям. Проверьте, допустимо ли это для задачи.',author:'Demo agent'},
    'src/types/review.ts': {priority:'low',order:4,summary:'Описывает ReviewComment: файл, строка, сторона diff, текст и автор. ReviewState объединяет комментарии с отметками просмотренных файлов. Это контракт для предыдущего шага.',reason:'Сверьте обязательные поля с созданием и чтением комментариев.',author:'Demo agent'},
    'src/mcp/tools.ts': {priority:'normal',order:5,summary:'Добавляет show_diff и get_review в список инструментов. Тип ToolName выводится из этого списка, чтобы имена инструментов оставались согласованными.',reason:'Сопоставьте список с обработчиками MCP-сервера.',author:'Demo agent'},
    'tests/mcp.test.ts': {priority:'validate',order:6,summary:'Новый тест вызывает showDiff с файлом и строкой 24 и проверяет текст ответа. Так замыкается путь от MCP-запроса к подтверждению открытия ревью.',reason:'Тест проверяет ответ, но не фактический переход к строке. Оцените достаточность проверки.',author:'Demo agent'},
    'package.json': {priority:'normal',order:7,summary:'Добавляет команду mcp для запуска сервера через tsx и поднимает версию примера до 0.2.0.',reason:'Проверьте наличие tsx и запуск команды.',author:'Demo agent'},
    'README.md': {priority:'low',order:8,summary:'Описывает подключение агента и цикл show_diff → ревью человеком → get_review.',reason:'Сверьте описание локального хранения с реализацией comments.ts.',author:'Demo agent'},
    'assets/preview.png': {priority:'low',order:9,summary:'Образец сравнения PNG: показывает исходное и изменённое изображение в демо.',reason:'Визуально сравните обе версии.',author:'Demo agent'},
    'assets/preview.jpg': {priority:'low',order:10,summary:'Образец сравнения JPEG для проверки отображения фотографий.',reason:'Проверьте пропорции и качество предпросмотра.',author:'Demo agent'},
    'assets/preview.webp': {priority:'low',order:11,summary:'Образец сравнения WebP завершает проверку поддерживаемых форматов изображений.',reason:'Проверьте отображение обеих версий.',author:'Demo agent'},
  },
};
