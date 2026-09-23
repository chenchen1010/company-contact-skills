# 公司与联系人查询 Skills

查询公司交易、公司档案、员工职业资料和商务邮箱，保留主体匹配依据、来源和未核对事项。两个 skill 提供通用查询能力，具体查什么、查多少、如何排序与呈现，由用户本次任务决定。

查询输入可以来自用户的对话或其提供的材料，不要求提交Excel。仓库中的“女鞋调研报告、顶易优先、不足时用Apify、每家公司5个邮箱并写回同一列”属于单独的任务提示词示例，不是skill的固定规则。

## 包含什么

| Skill | 用途 | 使用前准备 |
| --- | --- | --- |
| [topyi-remote-search](skills/topyi-remote-search/SKILL.md) | 通过管理员的共享服务查询交易、公司和联系人 | 领取自己的服务访问凭证，无需顶易账号或 Chrome 登录态 |
| [apify-linkedin-contacts](skills/apify-linkedin-contacts/SKILL.md) | 通过 Apify 上的 HarvestAPI 查询领英人员与邮箱线索 | 自己的 Apify 凭证及已授权费用上限 |

顶易链路：使用者的 Skill → 管理员服务器 → 顶易接口 → 返回结果 → 助手按本次要求呈现。

Apify链路：使用者的 Skill → Apify → 返回结果。Apify目前没有经过顶易共享服务器，也不是 LinkedIn 官方API。

## 安装

1. 下载本仓库ZIP，或克隆：

   ```bash
   git clone https://github.com/chenchen1010/company-contact-skills.git
   ```

2. 将 `skills/` 下的两个完整文件夹复制到 Codex 的 `~/.codex/skills/`。已有同名版本时先备份。其他助手使用其支持的 skills 安装目录。
3. 准备 Node.js 22+；脚本无需安装 npm 依赖。
4. 重新打开助手会话，确认能使用 `$topyi-remote-search` 和 `$apify-linkedin-contacts`。

## 配置和首次使用

**顶易：**向服务管理员领取分配给你自己的凭证文件，保存在项目的私有位置并加入Git忽略。格式参考 [空白配置示例](skills/topyi-remote-search/examples/service.env.example)。公开本仓库不代表公开授予共享服务使用权限；仓库不包含可用凭证。

```bash
node ~/.codex/skills/topyi-remote-search/scripts/remote.mjs status --env /你的私有路径/service.env
```

该命令检查连接及服务状态，不启动公司采集。服务默认入口为 `https://topyi.movingcostcheck.com`，供skill调用，不是网页查询表单。管理员统一维护顶易会话；登录失效时联系管理员。共享服务不设每日查询额度，所有人统一排队、一次执行一个任务，上游请求间隔至少1秒；每个凭证每分钟最多提交6个新任务。

**Apify：**按 [配置示例](skills/apify-linkedin-contacts/examples/credentials.env.example) 保存自己的 `APIFY_API_TOKEN`；启动前检查采集器当前价格并设定费用上限。没有配置Apify时，顶易查询仍可独立使用。

配置完成后，直接说明查询目标与所需结果即可。不要把真实凭证值粘贴到提示词或公开Issue中。

## 可选任务示例

如果本次任务是给Excel调研报告补充联系人，可以使用 [调研报告补充联系方式提示词](docs/调研报告补充联系方式_提示词.md)，按需修改品类、邮箱数量、优先级、采集顺序、预算及写回格式。这些要求只适用于采用该提示词的任务，不限制两个skill的其他用途。

完整步骤见 [给同事的使用说明](docs/给同事的使用说明.md)。

## 结果如何使用

- 公司名称可以存在标点、简称或法律后缀差异，需结合国家、贸易角色、官网和集团关系核对。
- 如需筛选或排序，以本次用户指定的岗位、条件和证据标准为准。
- 邮箱必须有实际来源。采集工具判断可用，不等于已成功收件；员工列表出现某人，也不代表已确认当前任职或采购权。
- 如实说明返回数量、分页与未核对事项，不为满足目标数量编造联系人或邮箱。
- 查询失败、账号限制、主体未匹配与未返回邮箱分别记录，不能统一写成“公司没有联系方式”。

## 验证范围

2026-09-23，顶易共享服务通过Gioseppo样例端到端验证：同事版skill返回865条交易总数、当前页50条，并取得公司和联系人数据。该验证不保证其他公司均有邮箱，也不保证会话长期有效。

Apify附带离线测试；运行这些测试不启动付费采集：

```bash
node --test skills/apify-linkedin-contacts/tests/*.test.mjs
node skills/topyi-remote-search/scripts/remote.mjs submit --input skills/topyi-remote-search/examples/contacts.json --dry-run
```

仓库仅包含skills、示例、测试和使用提示词，不包含服务器运维代码、顶易登录态、访问凭证或客户报告。
