/**
 * @ielts/core · 客户端入口（无 server-only，可被小程序 / H5 安全 import）
 * 领域纯 TS 逻辑 + 存储抽象 + 小程序数据服务。
 */
export * from "./review/review-schedule";
export * from "./review/answer-judge";
export * from "./review/initial-schedule";
export * from "./learning/types";
export * from "./speaking/types";
export * from "./client/day";
export * from "./client/item-id";
export * from "./client/progress";
export * from "./client/report-narrative";
export * from "./storage/adapter";
export * from "./config";
export * from "./llm-catalog";
export * from "./mini-service";
export * from "./plan";
export * from "./auth/wechat-bridge-client";

// 服务端专用逻辑（含 server-only）请通过 ./server 入口，小程序禁止 import。
