---
name: apify-linkedin-contacts
description: 通过 Apify 上的 HarvestAPI 采集器查询领英公司员工、人员资料及商务邮箱，核对当前雇主、保留来源与邮箱证据。用于公司员工与指定人员的信息查询；支持费用上限、断点收取和避免重复付费提交。
---

# Apify 领英联系人查询

按用户指定的公司或人员查询职业资料及商务邮箱线索，不保证每人有邮箱。Apify 是采集平台，HarvestAPI 是采集器提供方；这不是 LinkedIn 官方 API。邮箱可能来自采集器的额外搜索，不等于领英公开邮箱。

## 准备

先读 [采集与核对说明](references/api-and-review.md)。Node.js 22+，脚本无 npm 依赖。`SKILL_DIR` 指本 skill 目录，`WORK_DIR` 指用户项目私有工作目录。

凭证来自同事自己的 `APIFY_API_TOKEN` 环境变量，或通过 `--env` 指定的本地凭证文件；参照 `examples/credentials.env.example`。真实值只存项目 git 忽略的本地文件，权限600，不写入提示词、脚本、日志或分享包。

先检查可复用的已有结果，满足用户目标时不重复付费采集。本 skill 可独立使用，不要求先查询其他渠道。目标岗位、数量、排序和结果呈现方式由用户本次要求决定，不预设行业、联系人数量或输出结构。

## 操作

1. 确认目标公司领英页：名称、国家、官网、集团/品牌/法人关系应相符。不能只凭搜索排名。保留用户查询目标与已确认公司页的对应关系。查询指定人员时核对其主页及身份；涉及目标公司关联时再核对当前雇主。
2. 公司人员查询复制 `examples/employees.json`；已知某人主页则用 `examples/profiles.json`。替换示例 URL，明确 maxItems、岗位和模式。按用户要求设置岗位过滤，未要求时不自行限定某类岗位。示例参数不是业务默认值；当前脚本不自动判断岗位、不自动提高额度。
3. 读取采集器最新 schema/价格及账户权限；只有在用户已授权的预算内启动。没有预算时先做主体匹配、检查已有数据并询问缺少的费用范围；不要让用户重复批准已经授权的预算。不得充值、订阅或买代理。
4. 一个独立任务目录对应一次提交，先 dry-run，再 start。`--budget` 是单次美元上限，另在总账记录全部任务预算与实际费用；各任务占用预算之和不得超过用户总上限。进行中的任务保留预算，不将未知费用当零。下方预算数值仅为命令示例，须替换为本次已授权上限，不构成费用授权。

```bash
node "$SKILL_DIR/scripts/apify.mjs" start --spec "$WORK_DIR/job.json" --budget 0.15 --out "$WORK_DIR/run-001" --dry-run
node "$SKILL_DIR/scripts/apify.mjs" start --spec "$WORK_DIR/job.json" --budget 0.15 --out "$WORK_DIR/run-001" --env "$WORK_DIR/local.env"
node "$SKILL_DIR/scripts/apify.mjs" collect --out "$WORK_DIR/run-001" --wait 45 --env "$WORK_DIR/local.env"
```

5. 若仍运行，随后再次 collect；它不会创建付费任务。终态会保存 status.json、items.json、state.json；检查单项错误与返回数量，不以 SUCCEEDED 推断全部人员/邮箱齐全。
6. 提交结果不明时状态为 START_UNCERTAIN，禁止换目录盲目重试。在自己的 Apify 控制台确认运行后，用 `attach --out ... --run-id ... --env ...` 关联；脚本核对采集器与原始输入，再 collect。
7. 归一化资料：

```bash
node "$SKILL_DIR/scripts/normalize.mjs" --items "$WORK_DIR/run-001/items.json" --state "$WORK_DIR/run-001/state.json" --company-url https://www.linkedin.com/company/example-company/ --domain company.example --out "$WORK_DIR/contacts.json"
```

多公司输入时逐公司筛选原始记录并明确 company-url；不能把第一家公司的身份套给全部人员。建议每家公司独立任务，方便预算、恢复与结果归属核对。

## 核对与返回结果

- 检查 currentPosition 的公司页与目标一致；headline、历史 experience 或“公司员工查询返回了此人”均不足以独立确认在职。未匹配人员应明确标注，不认定为该公司现任员工。
- 邮箱必须来自实际返回或明确的官网公开页面；禁止猜格式、拼接姓名、捏造验证。没有姓名关联时注明未确认到个人，不把返回的私人邮箱自动用于商务开发。
- 名字、邮箱去重与当前任职确认分开。公司域名不一致需要集团关系证据；无证据保留待核线索，不为满足目标数量而降低身份核对标准。
- 仅按用户要求筛选、排序和组织结果，保留岗位、主体关联及邮箱证据；不预设采购岗位优先级。缺少必要排序依据时说明不确定性。
- 发现、任职核对、工具对邮箱的判断与实际投递是不同证据。解释原始状态的实际含义，不因返回 valid 或完成复查就写成已实际验证收件。工具判不可用的邮箱不得作为可用商务邮箱推荐；原始证据保留供复核。
- 来源注明“Apify 采集（HarvestAPI）”，附运行链接或采集器链接；人员主页用于任职核对，官网补充另注明用途，不把证明链接误当采集渠道。
- 如实说明实际返回数量、缺失字段及原因，区分主体未匹配、未返回邮箱、额度不足和请求失败。不自动发邮件，也不自动将邮箱发送给其他第三方验证服务。

离线验证：`node --test "$SKILL_DIR"/tests/*.test.mjs`。离线通过不代表账号额度或在线采集结果已验收。
