import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
export const root = resolve(import.meta.dirname, '..');
export const sourceDir = resolve(root, '港大/Kong, Lingpeng/来源');
export const date = '2026-09-17';

export async function fetchSource(url, name) {
  const path = resolve(sourceDir, name);
  await mkdir(dirname(path), { recursive: true });
  let status;
  try {
    const response = await exec('curl', ['-L', '--max-time', '40', '--retry', '1', '-sS', '-w', '%{http_code}', '-o', path, url], { maxBuffer: 4 * 1024 * 1024 });
    status = response.stdout;
  } catch (error) {
    status = `失败: ${error.message}`;
  }
  await writeFile(`${path}.source.json`, JSON.stringify({ url, date, status, file: name }, null, 2));
  return { path, status, url };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [url, name] = process.argv.slice(2);
  if (!url || !name) throw new Error('用法: node scripts/fetch-source.mjs URL 文件名');
  console.log(await fetchSource(url, name));
}
