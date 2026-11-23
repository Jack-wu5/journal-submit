#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
《大都市》投稿稿件格式自检（dadushi-journal 技能通用版，11类检查）

固化自2026-10-29~11-03两篇实稿的自检实践。通用化改造说明：
原版（dadushi/audit_loop.py）为第一稿硬编码版（文件路径/城市锚点/作者字段/表引出语/
缩写检查均写死），不可直接复用于新稿——本版将稿件专属项参数化，格式通用项保留。
R5/R8 已在通用化时移除，编号保留原位（防止外部引用错位）。

用法：
    python audit_loop.py <稿件.docx> [--must-contain 词1,词2] [--refs-min 10]
                         [--refs-max 14] [--chars-min 3800] [--chars-max 8000]
                         [--min-cites 8]

--must-contain：稿件专属必含词（城市锚点、作者简介要素、表引出语等，逗号分隔）
退出码：0=全部PASS  1=有FAIL  2=文件/参数错误
原则：FAIL先甄别真伪再动稿——工具也会误报（协议名≠缩写、文献条目编号≠漏上标）。

⚠ 参数来源提醒（2026-11-23 血案）：--abs-min/--abs-max（摘要字数）、--refs-min/max、
--chars-min/max 等数字必须从**官网原始稿约**核对后填写，不能照抄第三方截图或凭印象。
血案：把官网"摘要150-300字"误录为"300-350字"，自检参数也照错数字设，成稿327字超标
却全 PASS。工具只按给定参数检查，参数错了工具看不出来——填参数前先回官网原文核对。
"""
import re
import sys
import argparse
from pathlib import Path

from docx import Document


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('docx')
    ap.add_argument('--must-contain', default='')
    ap.add_argument('--refs-min', type=int, default=10)
    ap.add_argument('--refs-max', type=int, default=14)
    ap.add_argument('--chars-min', type=int, default=3800)
    ap.add_argument('--chars-max', type=int, default=8000)
    ap.add_argument('--min-cites', type=int, default=8)
    ap.add_argument('--abs-min', type=int, default=0)
    ap.add_argument('--abs-max', type=int, default=250)
    ap.add_argument('--allow-half-punct', action='store_true',
                    help='允许中文区半角标点（默认检查全角，个别刊例外的放行开关）')
    args = ap.parse_args()

    if not Path(args.docx).exists():
        print(f"文件不存在: {args.docx}")
        sys.exit(2)

    d = Document(args.docx)
    paras = [p for p in d.paragraphs if p.text.strip()]
    full = '\n'.join(p.text for p in paras)
    tbl_text = '\n'.join(c.text for t in d.tables for row in t.rows for c in row.cells)
    allt = full + '\n' + tbl_text
    issues = []

    def check(name, cond, msg=''):
        status = 'PASS' if cond else 'FAIL'
        print(f"[{status}] {name}" + (f' — {msg}' if msg and not cond else ''))
        if not cond:
            issues.append(f"{name}: {msg}")

    # R1 低级错误模式
    for pat, name in [(r'(的的|了了|是是|在在|和和|了着)', '叠字'),
                      (r'([，。；：、])\1', '双标点'), (r'“\s*”', '空引号')]:
        m = re.findall(pat, allt)
        check(f'R1 {name}', not m, str(m[:3]))
    check('R1 引号配对', allt.count('“') == allt.count('”'),
          f"左{allt.count('“')}右{allt.count('”')}")
    check('R1 括号配对', allt.count('（') == allt.count('）'))

    # R2 摘要/关键词/字数
    abstract = next((p.text for p in paras if p.text.startswith('摘')), '')
    if abstract:
        pm = re.match(r'^摘\s*要\s*[：:]', abstract)
        plen = pm.end() if pm else 5  # "摘要："/"摘 要："/"摘要:"前缀自适应；无匹配按旧版减5兜底
        n_abs = len(abstract) - plen
        check(f'R2 摘要{args.abs_min}-{args.abs_max}字',
              args.abs_min <= n_abs <= args.abs_max, f'当前{n_abs}字')
    else:
        check('R2 存在摘要', False)
    kw = next((p.text for p in paras if p.text.startswith('关键词')), '')
    nkw = kw.count('；') + kw.count(';') + 1 if kw else 0
    check('R2 关键词3-5个', 3 <= nkw <= 5, f'当前{nkw}个')
    body_chars = len(re.sub(r'\s', '', allt))
    check(f'R2 总字符{args.chars_min}-{args.chars_max}',
          args.chars_min <= body_chars <= args.chars_max, f'当前{body_chars}')

    # R3 引用标注双向对应
    cited = set()
    for m in re.finditer(r'\[(\d+)(?:-(\d+))?\]', full):
        a = int(m.group(1))
        b = int(m.group(2)) if m.group(2) else a
        cited.update(range(a, b + 1))
    refnums, in_refs = set(), False
    for p in paras:
        if p.text.strip().rstrip('：:') == '参考文献':
            in_refs = True
            continue
        if in_refs:
            m = re.match(r'\[(\d+)\]', p.text.strip())
            if m:
                refnums.add(int(m.group(1)))
    check('R3 正文引用⊆文献表', cited <= refnums, f'缺文献: {sorted(cited - refnums)}')
    check('R3 文献表⊆正文引用', refnums <= cited, f'未被引用: {sorted(refnums - cited)}')
    check('R3 文献编号连续', sorted(refnums) == list(range(1, len(refnums) + 1)),
          f'{sorted(refnums)}')

    # R4 表格完整
    for i, t in enumerate(d.tables, 1):
        empty = [(r, c) for r, row in enumerate(t.rows)
                 for c, cell in enumerate(row.cells) if not cell.text.strip()]
        check(f'R4 表{i}无空单元格', not empty, str(empty))
        check(f'R4 表{i}行列≥2', len(t.rows) >= 2 and len(t.columns) >= 2)

    # R6 数字单位空格规范
    for pat, name in [(r'\d(?:ms|mm|cm|kV|kVA|kW|MW|Pa|℃)(?![a-zA-Z])', '单位前缺空格'),
                      (r'\d %', '百分号前多空格')]:
        m = re.findall(pat, allt)
        check(f'R6 {name}', not m, str(m[:5]))

    # R7 引用标注上标渲染（仅正文区；文献条目编号不算）
    sup_ok, sup_bad, in_refs_zone = 0, 0, False
    for p in paras:
        if p.text.strip().rstrip('：:') == '参考文献':
            in_refs_zone = True
        if in_refs_zone:
            continue
        for r in p.runs:
            if re.fullmatch(r'\[\d+(?:-\d+)?\]', r.text or ''):
                if r.font.superscript:
                    sup_ok += 1
                else:
                    sup_bad += 1
    check('R7 引用标注上标渲染', sup_bad == 0 and sup_ok >= args.min_cites,
          f'上标{sup_ok}个, 非上标{sup_bad}个')

    # R14 文献表序号不得上标（2026-11-23 踩坑固化）
    # R7 故意跳过文献区，但若生成脚本用同一函数处理正文与文献表，会把 [n] 一并转上标，
    # 而 R7 看不见 → 自检全 PASS 却带着错误交付。此检查专补该盲区：文献表里的
    # [n] 是 GB/T 7714 的序号（正文格式），不是引用标注，必须为非上标。
    ref_super_bad = 0
    ref_entries = 0
    in_refs_zone = False
    for p in paras:
        if p.text.strip().rstrip('：:') == '参考文献':
            in_refs_zone = True
            continue
        if not in_refs_zone:
            continue
        if not re.match(r'^\[\d+\]', p.text.strip()):
            continue
        ref_entries += 1
        # 只查序号所在的 run（通常是首 run），整段任何上标都属异常
        for r in p.runs:
            if re.search(r'\[\d+\]', r.text or '') and r.font.superscript:
                ref_super_bad += 1
                break
    check('R14 文献表序号非上标', ref_super_bad == 0,
          f'文献{ref_entries}条, 序号误上标{ref_super_bad}条')

    # R15 中文区标点全角（2026-11-23 踩坑固化，可用 --allow-half-punct 关闭）
    # 中文正文/摘要/关键词/标题里的逗号、分号、冒号应为全角（GB/T 15834，
    # 中文科技期刊通行规范）。生成脚本默认用半角标点易踩坑，而 R1~R14 都不查此项。
    # 英文摘要、Key words、参考文献著录（GB/T 7714 用半角）、英文图题表题不在此检查范围。
    if not args.allow_half_punct:
        half_bad = []
        in_refs_zone = False
        for p in paras:
            t = p.text.strip()
            if t.rstrip('：:') == '参考文献':
                in_refs_zone = True
                continue
            if in_refs_zone:
                continue
            if t.startswith(('Abstract:', 'Key words:', 'Keywords:', 'KeyWords:',
                             'Fig.', 'Tab.', 'Table ', 'http')):
                continue
            # 只在该段确实含中文时检查
            if not re.search(r'[\u4e00-\u9fff]', t):
                continue
            # 逐字符找半角标点：前一个字符是中文/全角，或后一个字符是中文 → 判为半角误用
            for m in re.finditer(r'[,;:]', t):
                i = m.start()
                prev = t[i-1] if i > 0 else ''
                nxt = t[i+1] if i+1 < len(t) else ''
                prev_cn = bool(re.match(r'[\u4e00-\u9fff]', prev))
                next_cn = bool(re.match(r'[\u4e00-\u9fff]', nxt))
                if prev_cn or next_cn:
                    half_bad.append(t[max(0, i-10):i+10])
        check('R15 中文标点全角', not half_bad,
              f'半角误用{len(half_bad)}处: {half_bad[:3]}')

    # R9 文献格式统一
    refs_list = [p.text.strip() for p in paras if re.match(r'^\[\d+\]', p.text.strip())]
    check(f'R9 文献{args.refs_min}-{args.refs_max}条',
          args.refs_min <= len(refs_list) <= args.refs_max, f'{len(refs_list)}条')
    non_j = [r for r in refs_list
             if re.search(r'\[[SZM]\]', r) and not re.search(r'(19|20)\d{2}\.$', r)]
    check('R9 标准/文件类年份句点结尾', not non_j, str([r[:25] for r in non_j]))
    j_bad = []
    for r in refs_list:
        if '[J]' not in r:
            continue
        body = r.split('[J]', 1)[1]
        if not (re.search(r'[，,]\s*(19|20)\d{2}', body)
                and re.search(r'[：:]\s*[\d]+[\-–][\d]+\s*[.．]\s*$', body)):
            j_bad.append(r)
    check("R9 期刊类'年,卷(期):页.'格式", not j_bad, str([r[:35] for r in j_bad]))
    no_type = [r for r in refs_list if not re.search(r'\[[SJZ]\]', r)]
    check('R9 文献类型标识', not no_type, str([r[:25] for r in no_type]))

    # R10 标题结构连续性（1..N连续，不限定N）
    heads = [p.text.strip() for p in paras if re.match(r'^\d+(\.\d+)?\s', p.text.strip())]
    lvl1 = [h for h in heads if re.match(r'^\d+\s', h)]
    nums = [int(h.split()[0]) for h in lvl1]
    expect0 = nums == [0] + list(range(1, len(nums)))
    check('R10 一级标题连续', (nums == list(range(1, len(nums) + 1)) or expect0) and len(nums) >= 3,
          f'{nums}')

    # R11 稿件专属必含词（城市锚点/作者要素/表引出语，由调用者按稿提供）
    if args.must_contain:
        for w in [w.strip() for w in args.must_contain.split(',') if w.strip()]:
            check(f'R11 必含[{w[:16]}]', w in allt)

    # R12 常见错字词典
    wrong_words = ['做为', '既使', '登陆了', '其它', '帐号', '予与', '按装', '欢渡',
                   '急待', '克苦']
    found = [w for w in wrong_words if w in allt]
    check('R12 错字词典', not found, str(found))

    # R13 AI味模式
    ai_pats = [r'首先[，,].{0,30}其次[，,]', r'值得注意的是', r'不得不说', r'综上所述[，,]']
    for pat in ai_pats:
        m = re.findall(pat, allt)
        check(f'R13 无AI套话[{pat[:6]}]', not m, str(m[:2]))

    print('\n' + '=' * 50)
    if issues:
        print(f'共 {len(issues)} 项问题：')
        for i in issues:
            print(' ✗', i)
        sys.exit(1)
    print('全部检查 PASS，零问题。')
    sys.exit(0)


if __name__ == '__main__':
    main()
