/**
 * ELS Eval Runner Phase 0 — vitest setupFile
 * ------------------------------------------------------------
 * Eval 运行的环境基线：demo auth + memory repo + mock LLM。
 * 不依赖 .env.local（worktree 中不存在该文件）。
 */

process.env.DATA_PROVIDER = "memory";
process.env.AUTH_MODE = "demo";
process.env.DEMO_REVIEW_SEED_ENABLED = "false";
process.env.LLM_PRIMARY_PROVIDER = "mock";
process.env.LLM_FALLBACK_ENABLED = "false";
process.env.LLM_MOCK_ENABLED = "true";

// 确保任何 Supabase / 真实 Provider 凭据都不会被读到
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.BAILIAN_API_KEY;
delete process.env.BAILIAN_BASE_URL;
delete process.env.DEEPSEEK_API_KEY;
delete process.env.DEEPSEEK_BASE_URL;
