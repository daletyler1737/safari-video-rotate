#!/usr/bin/env python3
"""
把本地文件同步到 GitHub 仓库（走 Contents / Git Data API）。

为什么要用它：某些网络环境下 `git push` 到 github.com:443 会被代理拦掉
（报 `CONNECT tunnel failed, response 502`），但 api.github.com 是通的。
所以这里绕开 git 传输层，直接用 GitHub 的 REST API 建提交。

用法：
    export GH_TOKEN=ghp_xxx          # 需要 repo 权限的 Personal Access Token
    python3 tools/sync-to-github.py [提交信息]

特性：
    · 增量 —— 先算每个文件的 git blob SHA1，和远端 tree 比对，只上传变化的文件
    · 一次提交 —— 复用 Git Data API 的 blobs/trees/commits 串成一个 commit
    · 不需要本地 git 仓库（有则用 `git ls-files` 排除 .gitignore 之外的文件）
"""

import base64
import hashlib
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

OWNER = 'daletyler1737'
REPO = 'safari-video-rotate'
BRANCH = 'main'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = 'https://api.github.com'

TOKEN = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN')
if not TOKEN:
    sys.exit('缺少 GH_TOKEN 环境变量（需要有 repo 权限的 token）')


def api(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method, headers={
        'Authorization': 'token ' + TOKEN,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'sync-to-github',
    })
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def local_files():
    """优先用 git 列出跟踪的文件；没有 git 仓库就排除常见垃圾目录后遍历。"""
    try:
        out = subprocess.run(['git', '-c', 'core.quotepath=false', 'ls-files'],
                             cwd=ROOT, capture_output=True, text=True, check=True).stdout
        files = [f for f in out.split('\n') if f.strip()]
        if files:
            return files
    except Exception:
        pass
    skip = {'.git', 'node_modules', '__pycache__', '.DS_Store'}
    files = []
    for base, dirs, names in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in skip]
        for n in names:
            if n in skip or n.endswith(('.png', '.log')):
                continue
            files.append(os.path.relpath(os.path.join(base, n), ROOT))
    return sorted(files)


def blob_sha(data):
    """git 的 blob 对象 id 算法：sha1("blob <长度>\\0" + 内容)。"""
    return hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest()


def main():
    msg = sys.argv[1] if len(sys.argv) > 1 else '同步更新'
    files = local_files()
    print('本地文件 %d 个' % len(files))

    # 远端当前状态
    st, r = api('GET', '/repos/%s/%s/git/trees/%s?recursive=1' % (OWNER, REPO, BRANCH))
    if st != 200:
        print('读取远端 tree 失败', st, r)
        sys.exit(1)
    remote = {e['path']: e['sha'] for e in r.get('tree', []) if e['type'] == 'blob'}
    st, ref = api('GET', '/repos/%s/%s/git/ref/heads/%s' % (OWNER, REPO, BRANCH))
    parent = ref['object']['sha'] if st == 200 else None

    tree, changed = [], []
    for f in files:
        data = open(os.path.join(ROOT, f), 'rb').read()
        sha = blob_sha(data)
        if remote.get(f) == sha:
            tree.append({'path': f, 'mode': '100644', 'type': 'blob', 'sha': sha})
            continue
        st, res = api('POST', '/repos/%s/%s/git/blobs' % (OWNER, REPO),
                      {'content': base64.b64encode(data).decode(), 'encoding': 'base64'})
        if st not in (200, 201):
            print('上传 %s 失败: %s %s' % (f, st, res))
            sys.exit(1)
        tree.append({'path': f, 'mode': '100644', 'type': 'blob', 'sha': res['sha']})
        changed.append('%s (%d B)' % (f, len(data)))

    gone = [p for p in remote if p not in files]
    if not changed and not gone:
        print('远端已是最新，无需提交')
        return
    if gone:
        print('远端将删除:'); [print('  - ' + p) for p in gone]
    print('将上传 %d 个文件:' % len(changed)); [print('  + ' + c) for c in changed]

    st, r = api('POST', '/repos/%s/%s/git/trees' % (OWNER, REPO), {'tree': tree})
    if st not in (200, 201):
        print('建 tree 失败', st, r); sys.exit(1)
    body = {'message': msg, 'tree': r['sha']}
    if parent:
        body['parents'] = [parent]
    st, r = api('POST', '/repos/%s/%s/git/commits' % (OWNER, REPO), body)
    if st not in (200, 201):
        print('建 commit 失败', st, r); sys.exit(1)
    head = r['sha']

    if parent:
        st, r = api('PATCH', '/repos/%s/%s/git/refs/heads/%s' % (OWNER, REPO, BRANCH),
                    {'sha': head, 'force': False})
    else:
        st, r = api('POST', '/repos/%s/%s/git/refs' % (OWNER, REPO),
                    {'ref': 'refs/heads/' + BRANCH, 'sha': head})
    if st not in (200, 201):
        print('更新分支失败', st, r); sys.exit(1)

    print('完成 %s/%s @ %s' % (OWNER, REPO, head[:10]))
    print('https://github.com/%s/%s' % (OWNER, REPO))


if __name__ == '__main__':
    main()
