/**
 * Learning Service — Repository 工厂（委托中央工厂）
 * ------------------------------------------------------------
 * M1: 委托给 repository-factory，确保所有模块使用同一单例。
 */
export { getLearningRepository as getRepository } from "@/lib/repository-factory";
