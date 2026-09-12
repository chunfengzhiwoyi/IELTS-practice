/**
 * Planner V1 集中参数（PRODUCT-LOOP-02B + 03B targeted fix）
 * ------------------------------------------------------------
 * 所有可调阈值集中于此；改参数不碰决策逻辑。
 * 03B：移除 REVIEW_PRESSURE_DUE_COUNT 绝对闸门；REVIEW_BUDGET_CAP_RATIO 正式激活。
 */
export const PLANNER_CONFIG = {
  /** Speaking cadence floor：闲置 ≥ 该天数 → 必须安排口语（受保护 slot）。
   *  speakingIdleDays == null（从未完成口语）同样视为 cadence overdue。 */
  SPEAKING_MAX_IDLE_DAYS: 2,
  /** 最小口语训练时长（分钟） */
  SPEAKING_SLOT_MINUTES: 5,

  /** 复习耗时模型：每词条约 0.5 分钟，向上取整 */
  REVIEW_MINUTES_PER_ITEM: 0.5,
  /** Review 预算上限比例：Review 建议量至多占用 dailyBudget 的该比例。
   *  03B 激活：REVIEW target.count 预算感知（不再假设"必须完成全部 due"）。 */
  REVIEW_BUDGET_CAP_RATIO: 0.7,

  /** 新学日切片：weeklyWordTarget / 该除数 */
  LEARN_WEEKLY_DIVISOR: 7,
  /** 新学单日上限（防 weekly target 过大导致单日过载） */
  LEARN_MAX_COUNT: 20,
  /** 新学单条耗时估算（分钟） */
  LEARN_MINUTES_PER_ITEM: 1.5,

  /** 能力画像薄弱触发：recurring issues ≥ 该值 → 定向口语训练（可压缩项） */
  WEAKNESS_RECURRING_MIN: 2,
} as const;
