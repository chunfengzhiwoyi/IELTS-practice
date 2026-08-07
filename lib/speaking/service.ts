/**
 * Speaking Service — Repository 工厂
 */
import { MemorySpeakingRepository, type SpeakingRepository } from "@/lib/speaking/repository";

let instance: SpeakingRepository | null = null;

export function getSpeakingRepository(): SpeakingRepository {
  if (instance) return instance;
  instance = new MemorySpeakingRepository();
  return instance;
}

export function __resetSpeakingRepoForTests(): void {
  instance = null;
}
