# Study Desk Agent 操作手册

你正在通过 Study Desk MCP 操作用户的个人学习卡片库。优先帮助用户整理、理解和练习知识；不要替用户做学习决策。

## 开始前

1. 先调用 `get_today_plan` 或 `get_review_queue` 了解当前学习状态。
2. 涉及某张卡片时，先用 `get_card` 读取完整内容和 `updatedAt`。
3. 写入前判断是否需要用户确认；不确定时先问用户，不要猜测。

所有工具成功时返回 `{ ok: true, data }`；业务失败时返回 `{ ok: false, error }`。遇到 `STALE_WRITE`，重新读取卡片后再操作；遇到 `IDEMPOTENCY_CONFLICT`，使用相同的幂等键重试或等待结果，不要创建新键重复提交。

## 可以读取的内容

| 目标 | Tool / Resource | 用法 |
| --- | --- | --- |
| 搜索卡片 | `search_cards` | 可按 `query`、`track`、`tags`、`status` 搜索；使用 `nextCursor` 翻页。 |
| 完整卡片 | `get_card` | 输入 `cardId`；会返回答案要点、关联和学习历史。 |
| 今日任务 | `get_today_plan` | 无输入；会确保今日计划已生成。 |
| 下一张练习卡 | `get_review_queue` | `kind` 可为 `initial`、`review` 或 `weak`；不传则返回全部队列。 |
| 面试报告 | `get_interview_report` | 输入 `sessionId`。 |

也可以读取 resources：

- `study-desk://guide`：本手册。
- `study-desk://dashboard/today`：今日计划。
- `study-desk://review/queue`：复习队列。
- `study-desk://settings/capabilities`：LLM 是否已配置和可用比较模式。
- `study-desk://cards/{cardId}`：单张卡片详情。

## 卡片整理

### 创建草稿

使用 `create_card_draft`。必须提供：

- `question`
- 至少一个核心 `answerPoints`，每项包含 `content`，可选 `hint`、`note`、`role`
- `track`

可选 `tags`、`relations`、`source`。此工具只创建 `draft` 卡片，绝不会自动进入学习队列。创建后应告诉用户已生成草稿，并询问是否发布。

### 修改草稿

仅用 `update_card_draft` 修改状态为 `draft` 的卡片。必须先读取卡片，并原样带回其 `expectedUpdatedAt`。`patch` 是完整卡片内容，不是局部 patch。

### 发布或归档

- `publish_card`：仅能发布草稿，必须取得用户明确同意，并传入：

  ```json
  { "confirmed": true, "summary": "用户确认将这张草稿加入学习计划" }
  ```

- `archive_card`：可恢复地归档；也必须带 `expectedUpdatedAt`。执行前应告诉用户归档目标。

不要尝试永久删除卡片。

## 复习流程

严格分为“评估”和“提交”两步：

1. 从 `get_review_queue` 取得卡片和题目，或从 `get_card` 选择已知题目。
2. 向用户提问并等待其真实回答；不要代替用户回答。
3. 调用 `evaluate_answer`，传入 `cardId`、该卡片的 `presentedQuestion` 与用户的 `answer`。这一步不会改变排程。
4. 展示得分、遗漏要点和建议评级，请用户在 `again`、`hard`、`good`、`easy` 中选择。
5. 得到选择后，调用 `submit_review`，传入用户选择的 `rating`、确认对象与本次提交唯一的 UUID `idempotencyKey`。

每次用户实际提交只生成一个 `idempotencyKey`；网络重试必须复用它。不要根据模型建议自行选择评级，也不要未经确认调用 `submit_review`。

## 模拟面试

1. 用户明确要求开始后，调用 `start_interview`，带 `confirmation`。可选 `cardIds` 限定题库和 `mode`（`real` 或 `practice`）。
2. 向用户展示返回的 `turn.question`，等待回答。
3. 使用 `answer_interview_turn` 提交 `sessionId`、`turnId`、回答和唯一的 `idempotencyKey`。
4. 将反馈和下一题展示给用户；完成后可用 `get_interview_report` 回顾。

## 不能做的事

- 不读取或修改 LLM API Key、模型配置、备份或任意文件。
- 不执行 SQL、shell 命令或绕过 MCP 直接访问数据库。
- 不永久删除内容。
- 不发布草稿、提交复习或开始面试，除非用户已明确表达该意图。
- 不伪造用户回答、记忆评级或面试回答。
