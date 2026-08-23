# 竞品研究：aurostars/Job-Application-Helper（秋招网申助手）vs JobKoI

> 研究日期：2026-08-08
> 对象仓库：https://github.com/aurostars/Job-Application-Helper （MIT，37★，60 commits）
> 对比基线：JobKoI 扩展（`apps/extension`，Chrome MV3）

---

## 0. 一句话区别

| 维度 | Job-Application-Helper（对方） | JobKoI（我们） |
|------|-------------------------------|-------------------|
| 产品定位 | **输入侧**：把已存资料「填进」招聘网站的网申表单 | **管理侧 + 输出侧**：抓 JD → 跟踪投递进度 → 改简历匹配 JD |
| 核心价值 | 一键自动填写网申表单 + 简历上传 | 投递 pipeline 跟踪 + JD×简历对靶定制 + 导出 |
| AI 角色 | 可选增强（本地规则优先，AI 仅在补位时用） | 核心引擎（简历定制主要靠 DeepSeek，无 key 才降级） |
| 一句话 | 「替你把表填了」 | 「替你管投递 + 把简历写得更对口」 |

**结论**：两者解决的是求职流程里**相邻但不重叠**的环节。对方强在「最后一公里填表」，我们强在「过程管理 + 简历定向改写」。互补而非直接竞品。

---

## 1. 架构对比

| 项 | 对方 | JobKoI |
|----|------|-----------|
| 形态 | 单包 Chrome MV3 扩展 | pnpm monorepo（`extension` + `web` + `api` + `packages/*`） |
| 入口 | popup / options(资料管理) / sidepanel(信息浮窗) / offscreen(截图) / content / background | sidepanel / tailor / resume / dashboard + content + background |
| 技术栈 | React 19 + Vite 8 + **Ant Design 6** + oxlint | React 18 + Vite 6 + 自定义 CSS + lucide-react |
| 表单检测 | 内嵌 `FormDetector` + `FieldMatcher`（content script 内） | `form-adapters.js` + `matchFormFields`（辅助，非主战场） |
| AI 接入 | **OpenAI 兼容 / Claude 双后端**，用户自配 baseUrl+key+model | **仅 DeepSeek**（`deepseek-v4-flash`，json_object） |
| 同步 | JSON 备份 + **WebDAV** 自动同步（ETag 防覆盖） | 云端 `@offerflow/api`（设备码配对）+ Obsidian |
| 测试 | 内置 `node --test` 单测（form/visual/nlp/backup 等） | 以 typecheck/build 为准 |

---

## 2. 对方实现逻辑深度拆解（重点）

### 2.1 表单填充引擎（对方主战场）
文件：`src/content/formDetector.ts`、`formFiller.ts`、`utils/fieldMatcher.ts`

1. **字段检测 `FormDetector.detectFields()`**
   - `querySelectorAll` 所有 `input/textarea/select`（排除 `hidden/submit/button`）。
   - 每个元素用 `FieldMatcher.extractIdentifiers` 抽取 `name/id/placeholder/labelText/type/autocomplete`，并向上找 `label[for]`、父 `label`、前序兄弟节点、`data-form-field-*` 容器。
   - `matchFieldType()` 用「关键词 `includes` + Levenshtein 相似度 >0.7」匹配 `FIELD_PATTERNS`，`confidence >= 0.5` 才采纳。
   - 特殊类型直接定：`type=email/tel/date/file` 置信度 1.0。

2. **针对网申站的硬编码适配（很实战）**
   - 字节系：精确识别 `education_type`（学历类型）避免误判成「学校」；识别 `.ud__select` 自定义下拉、`.ud__select__selector__selectItem`。
   - 日期范围组件（`start_end_time`）：**先写结束时间再写开始时间**，规避「开始不能晚于结束」的校验回滚。
   - 动态多行：`ensureRows()` 自动点「添加」按钮补齐教育/经历行数（`prepareDynamicSections`）。

3. **写入 `FormFiller.fillField()`（兼容 React/Vue/Angular）**
   - 用**原生 setter**（`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set`）赋值；
   - 关键技巧：先把 React 的 `_valueTracker.setValue(oldValue)`，再 `triggerEvents` 派发 `input/change/blur/keydown/keyup`，并直接调用 `__reactEventHandlers$` / `__reactProps$` 上的 `onChange`；
   - 自定义 select 用 `mousedown/mouseup/click` + React handler 模拟选择；
   - 简历上传：`uploadResume` 用 `DataTransfer` 设置 `fileInput.files` 再触发 `change`。
   - 这些都说明对方在「真实招聘站点 DOM 兼容」上下了大功夫。

### 2.2 AI 的四种用法（对方把 AI 当增强，而非必需）
文件：`services/llm/llmService.ts`、`services/llm/prompts.ts`、`content/visualRegionFill.ts`

| 场景 | 触发 | 说明 |
|------|------|------|
| ① 简历解析 | `PARSE_RESUME` | PDF/DOCX/MD/TXT/JSON → 结构化 `UserProfile`（LLM 抽 JSON） |
| ② 字段分类 | `MATCH_FIELDS_LLM` | 本地规则匹配不上的字段，交给 LLM 判定 `fieldType` |
| ③ 模块补填 | `AI_FILL_SECTION` | 扫描空白字段，分组发给 LLM 用 profile 匹配值 |
| ④ **视觉框选补填** | `AI_FILL_VISUAL_REGION` | **截图选区 + 控件清单**发给 vision 模型，返回 `controlId→value` 映射 |

- **视觉框选补填（最独特）**：content 脚本在页面画遮罩，用户单击模块或拖框选区 → 收集区内空白控件（`controlId/label/options/rect`）+ 整页 `innerText` → 调用 offscreen 截图 → 把「截图 + 控件清单 + profile」发给 vision 模型 → 模型只输出已有 `controlId` 的映射；`validateVisualRegionMappings` 还会校验返回值必须来自 profile 且匹配 option，**绝不编造**。
- **开放题生成**（`GENERATE_ANSWER`）：根据 profile 写自我介绍/职业规划/为什么加入等网申开放题答案——这是对方独有的「写内容」能力。
- **容错设计**：`LLMService.chat()` 对推理模型「思考耗尽 max_tokens 导致空正文」自动加倍重试到上限（`TruncatedEmptyOutputError`），并提示改用非推理模型。
- **工程哲学**：AI 只输出 profile 中**已存在的原始值**，规则是「不猜测、不改写、不编造」。

### 2.3 数据模型与存储
- `UserProfile`：`personal / education[] / experience[] / projects[] / customInformation[] / skills[] / certifications[] / resume`。单一 profile 对象。
- 存储：`chrome.storage.local`，键 `userProfile / settings / llmConfig / webdavConfig / syncMetadata`。
- 明文存储，README 明确警告隐私风险；WebDAV 同步**不含凭据**，冲突手动选 local/remote。

---

## 3. JobKoI 实现逻辑（我们的强项）

来自对 `apps/extension` 的源码探索：

- **JD 抓取与解析**：`content.js` `extract()` 从 JSON-LD `JobPosting` + 文本正则抽 `company/position/responsibilities/requirements`；`extractProgressEvidence()` 用阶段模式 + 颜色/aria 抽**投递进度**；DeepSeek 精炼时 **DOM 证据优先级 > LLM 推断**。
- **投递跟踪（对方完全没有）**：`JobApplication` 存 `offerflow.jobs`，`findDuplicate` 归一化去重；background `alarms` 每 5 分钟 + content `MutationObserver` 自动回写阶段/事件。
- **简历对靶定制（对方没有）**：`tailorResumeWithDeepSeek` 把 `PersonalProfile` 拍平为 `ResumeData`，返回 `TailoredResumeBundle{context, jd, resume, notes, unsupportedClaims}`；`mergeResume` 只改 bullet 措辞、**冻结日期/雇主/数字**，虚构事实进 `unsupportedClaims`；`buildLocalFallback` 无 key 时关键词兜底。生成可编辑 HTML 支持 **JD↔bullet 双向高亮**，PDF base64 存 `offerflow.tailoredPdf.{jobKey}`。
- **同步**：云端 `@offerflow/api` 设备码配对 + Obsidian Markdown 同步；`redactForLLM` 做 PII 脱敏。
- **表单填写（我方有完整引擎，非仅辅助）**：扫描用 `scanApplicationForm` + `OfferFlowFormAdapters`（按 ATS 选适配器：北森/Beisen、Moka、牛客/Nowcoder、腾讯/Tencent、generic），正则匹配 field→profile key；未知字段才调 `matchFormFields`（DeepSeek 只做语义映射，不发资料值）。写入用 `fillApplicationForm → setNativeValue`：覆盖原生 select、radio/checkbox（含 `role=radio`/phoenix）、Element UI cascader/select、combobox（ArrowDown/Enter）、phoenix-select（日期/地区/普通）、contenteditable、input/textarea（原生 setter + `dispatchInputEvents`）；写后 `readControlValue` **回读校验**并 `sendFillProgress` 实时反馈；`ensureRepeatableEntries` 展开重复行。详见 `2026-08-08-填表引擎对比.md`。

---

## 4. 关键能力对比表

| 能力 | 对方 | JobKoI |
|------|------|-----------|
| 自动填表（资料→表单） | ✅ 完整引擎（检测/匹配/写入/多行/自定义组件/简历上传） | ✅ 完整引擎（扫描/ATS 适配/多控件写入/重复行展开/回读校验） |
| 网申站深度适配 | ✅ 字节/牛客系硬编码（ud__select/applyFormModuleWrapper） | ✅ 北森/Beisen·Moka·牛客·腾讯+generic 适配器 |
| 视觉框选补填（截图+vison） | ✅ 独有 | ❌ |
| 网申开放题自动作答 | ✅ | ❌ |
| JD 抓取与解析 | ❌（不抓 JD） | ✅ |
| 投递进度跟踪 pipeline | ❌ | ✅ 独有 |
| JD×简历对靶审阅/双向高亮 | ❌ | ✅ 独有 |
| 多简历 × 多岗位定制 | ❌（单一 profile） | ✅ |
| AI 模型灵活度（任意 OpenAI 兼容/Claude） | ✅ | ❌（仅 DeepSeek） |
| 云端同步 | ⚠️ WebDAV | ✅ 自有 API + Obsidian |
| PII 脱敏 | ❌ 明文 | ✅ |

---

## 5. 工程哲学对比（值得互相印证）

- **本地优先、AI 补强、不编造**：双方在 AI 使用上都遵循「规则先上，AI 只在补位时用，且只输出已有事实」。对方 `validateVisualRegionMappings` 校验返回值来源；我们 `unsupportedClaims` 收集虚构事实。理念一致。
- **写入真实 DOM 的兼容性**：对方 `_valueTracker` + 原生 setter + React handler 调用是行业级做法，可直接借鉴。
- **AI 后端开放性**：对方支持任意 OpenAI 兼容端点 + Claude；我们锁 DeepSeek。若想提升灵活度，可参考对方的 `LLMProvider` + baseUrl 抽象。

---

## 6. 对 JobKoI 的启示 / 可借鉴点

1. **补「填表」短板**：若要做「一键把资料/定制简历填进招聘网站」，对方的 `FormDetector`/`FieldMatcher`/`FormFiller` 是高质量参考，尤其 React 受控写入、动态多行、日期范围顺序、简历上传。
2. **视觉框选补填**：这是差异化「最后一公里」能力，可补齐我们表单填写的空白，且对方已验证 prompt + 截图 + 控件清单的可行性。
3. **网申开放题生成**：我们改写的是简历 bullet，对方能写开放题答案；可作为 tailor 的延伸场景。
4. **AI 后端抽象**：参考对方把 LLM 配置成「baseUrl + key + model + provider」的可插拔结构，降低对单一厂商依赖。
5. **测试文化**：对方有较完整的 `node --test` 单测（form/visual/nlp/backup），我们目前以 typecheck 为主，可补关键模块单测。

---

## 7. 参考文件清单（对方仓库）

- `src/content/formDetector.ts` — 字段检测
- `src/content/formFiller.ts` — 表单写入引擎（含 React 兼容）
- `src/utils/fieldMatcher.ts` — 字段类型匹配（关键词+Levenshtein）
- `src/services/llm/llmService.ts` — OpenAI/Claude 双后端 + 容错重试
- `src/services/llm/prompts.ts` — 4 类 AI prompt（解析/分类/补填/视觉/开放题）
- `src/content/visualRegionFill.ts` — 截图框选 + 控件收集 + vision 补填
- `src/shared/types.ts` / `src/shared/storage.ts` — 数据模型与存储
- `src/background/index.ts` — 消息路由（填充/解析/同步/视觉）
