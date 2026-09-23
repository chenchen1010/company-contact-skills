---
name: apify-linkedin-contacts
description: 通过 Apify 上的 HarvestAPI 采集器查询领英公司员工、人员资料及商务邮箱，核对当前雇主、保留来源与邮箱证据。适用于公司名单和调研报告联系人补充，尤其是顶易已有结果不足目标数量时；支持费用上限、断点收取和避免重复付费提交。
---

# Apify 领英联系人补充

目标是补足与目标公司及岗位匹配的商务联系人，不保证每人有邮箱。Apify 是采集平台，HarvestAPI 是采集器提供方；这不是 LinkedIn 官方 API。邮箱可能来自采集器的额外搜索，不等于领英公开邮箱。

## 准备

先读 [采集与核对说明](references/api-and-review.md)。Node.js 22+，脚本无 npm 依赖。`SKILL_DIR` 指本 skill 目录，`WORK_DIR` 指用户项目私有工作目录。

凭证来自同事自己的 `APIFY_API_TOKEN` 环境变量，或通过 `--env` 指定的本地凭证文件；参照 `examples/credentials.env.example`。真实值只存项目 git 忽略的本地文件，权限600，不写入提示词、脚本、日志或分享包。

先复用已有结果。若顶易已有目标数量（默认5个）的非重复、主体匹配、未被判不可用的商务邮箱，不再启动新的采集。已采集的 Apify 结果可以与顶易按证据质量合并，不必丢弃。

## 操作

1. 确认目标公司领英页：名称、国家、官网、集团/品牌/法人关系应相符。不能只凭搜索排名。记录报告原行到已确认公司页的映射。
2. 公司人员查询复制 `examples/employees.json`；已知某人主页则用 `examples/profiles.json`。替换示例 URL，明确 maxItems、岗位和模式。公司查询优先小批次针对采购/买手/商品岗位；当前脚本不自动判断岗位、不自动提高额度。
3. 读取采集器最新 schema/价格及账户权限；只有在用户已授权的预算内启动。没有预算时先做主体匹配、检查已有数据并询问缺少的费用范围；不要让用户重复批准已经授权的预算。不得充值、订阅或买代理。
4. 一个独立任务目录对应一次提交，先 dry-run，再 start。`--budget` 是单次美元上限，另在总账记录全部任务预算与实际费用；各任务占用预算之和不得超过用户总上限。进行中的任务保留预算，不将未知费用当零。

```bash
node "$SKILL_DIR/scripts/apify.mjs" start --spec "$WORK_DIR/job.json" --budget 0.15 --out "$WORK_DIR/run-001" --dry-run
node "$SKILL_DIR/scripts/apify.mjs" start --spec "$WORK_DIR/job.json" --budget 0.15 --out "$WORK_DIR/run-001" --env "$WORK_DIR/local.env"
node "$SKILL_DIR/scripts/apify.mjs" collect --out "$WORK_DIR/run-001" --wait 45 --env "$WORK_DIR/local.env"
```

5. 若仍运行，随后再次 collect；它不会创建付费任务。终态会保存 status.json、items.json、state.json；检查单项错误与返回数量，不以 SUCCEEDED 推断全部人员/邮箱齐全。
6. 提交结果不明时状态为 START_UNCERTAIN，禁止换目录盲目重试。在自己的 Apify 控制台确认运行后，用 `attach --out ... --run-id ... --env ...` 关联；脚本核对采集器与原始输入，再 collect。
7. 归一化资料：

```bash
node "$SKILL_DIR/scripts/normalize.mjs" --items "$WORK_DIR/run-001/items.json" --state "$WORK_DIR/run-001/state.json" --company-url https://www.linkedin.com/company/example-footwear/ --domain company.example --out "$WORK_DIR/contacts.json"
```

多公司输入时逐公司筛选原始记录并明确 company-url；不能把第一家公司的身份套给全部人员。建议每家公司独立任务，方便预算、恢复与行对应。

## 核对与业务交付

- 检查 currentPosition 的公司页与目标一致；headline、历史 experience 或“公司员工查询返回了此人”均不足以独立确认在职。未匹配人员不能进入该公司优先发送名单。
- 邮箱必须来自实际返回或明确的官网公开页面；禁止猜格式、拼接姓名、捏造验证。没有姓名关联写“未明确到个人”。不把返回的私人邮箱自动用于商务开发。
- 名字、邮箱去重与当前任职确认分开。公司域名不一致需要集团关系证据；无证据保留待核线索，不凑满5个。
- 优先岗位对口且主体明确、有较强邮箱证据的人；其次其他采购负责人；再是官网公开商务邮箱/转接入口。尚未确认收件能力的线索放后，并明确标注。
- 用户表格仅使用普通中文。采集工具的可用判断写“采集工具判断可用，尚未独立确认能否收件”；域名统一接收导致无法判定时写“暂不能确认此邮箱是否真实存在”；已判不可用的邮箱排除发送名单。
- 发现、任职核对、收件判断与实际投递是不同证据。不得因为返回 valid 或完成复查就写“已实际验证收件”。不要自动发邮件，也不要自动将邮箱发送给其他第三方验证服务。
- 来源写“Apify 采集（HarvestAPI）”，附运行链接或采集器链接；人员主页作为任职核对链接。官网补充另写“官网公开/核对”。不把证明链接误当采集渠道。
- 输出每家公司最多5个邮箱在一列，编号对应姓名、职位、优先级、核验说明与来源。不足就保留实际数量及原因，说明是没有匹配主体、未返回邮箱、额度不足还是请求失败。

离线验证：`node --test "$SKILL_DIR"/tests/*.test.mjs`。离线通过不代表账号额度或在线采集结果已验收。
