# 采集器、预算与结果证据

资料核对日期：2026-09-23。调用前查看官方页面，采集器输入、模式和价格可能变化。

| 用途 | Actor / 文档 |
|---|---|
| 公司员工 | [harvestapi/linkedin-company-employees](https://apify.com/harvestapi/linkedin-company-employees/input-schema) |
| 指定人员 | [harvestapi/linkedin-profile-scraper](https://apify.com/harvestapi/linkedin-profile-scraper/input-schema) |
| 启动任务 | [Apify Runs API](https://docs.apify.com/api/v2/actors-runs-post) |
| 分页下载 | [Apify Dataset API](https://docs.apify.com/api/v2/dataset-items-get) |

API 的 Actor ID 使用 `harvestapi~linkedin-company-employees` 和 `harvestapi~linkedin-profile-scraper`。

公司示例包含 companies、maxItems、jobTitles、profileScraperMode。邮箱模式字符串为 `Full + email search ($12 per 1k)`；人员详情模式为 `Profile details + email search ($10 per 1k)`。这里是采集器枚举值，不是最终账单承诺；不能自行改写模式字符串里的价格。

只读检查：`apify.mjs describe --spec job.json --out info --env local.env` 保存 Actor 和默认 build 信息，必要时结合上述 input-schema 页面。此命令不启动采集。

## 网络与恢复

- 所有认证请求只发送到 `https://api.apify.com/v2`，Authorization Bearer；不把 token 放 URL、不跟随重定向。
- POST `/acts/{actor}/runs?maxTotalChargeUsd=...&timeout=300&restartOnError=false` 启动。脚本先独占创建 state.json；目录重复会拒绝，避免重复计费。
- GET `/actor-runs/{runId}` 收取状态；GET `/datasets/{datasetId}/items` 每页500，保留错误行并校验总数。状态未完成就不报告最终结果。
- START_UNCERTAIN 是提交结果不明，不是“没有运行”。通过控制台核实后 attach；若不能关联，保留原状态及原因，不批量重启。
- 失败任务也可能收费。费用以 API 返回及控制台为准，未提供费用时保留 null。每次预算上限不等于应用层自动限制整个报告的总预算，需要维护总账。
- 免费层、账户项目数限制、预算截断、站点无资料分别记录；不要靠重复拆分同一任务绕过账户限制。

## 返回信息与可信度

原始字段可能包括 firstName、lastName、linkedinUrl、currentPosition、experience、emails。邮箱项常含 email、status、catchAllDomain、free，均允许缺失；缺失不按 false 或零处理。

| 原始证据（内部保留） | 给业务用户的说明 |
|---|---|
| status=valid 且 catchAllDomain=false | 采集工具判断可用，尚未独立确认能否收件 |
| catchAllDomain=true | 暂不能确认此邮箱是否真实存在 |
| risky / unknown / 缺少判断 | 已找到邮箱线索，能否收件尚未确认 |
| invalid / undeliverable | 采集工具判断不可用，排除发送名单 |
| 未返回 emails | 本次没有找到邮箱，不代表公司没有联系方式 |

人员主页失效不等于离职；出现重定向时核对新主页与当前雇主。来源为 Apify 上的 HarvestAPI，不能宣称使用 LinkedIn 官方接口；邮箱具体上游如未披露就写未知。收件判断不是已发邮件的回执。
