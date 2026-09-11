/**
 * ima 知识库 OpenAPI 客户端（直连，凭证存本机）。
 * 文档：https://ima.qq.com/openapi/wiki/v1，鉴权 Header ima-openapi-clientid / ima-openapi-apikey。
 * 体验版需在小程序后台「服务器域名」白名单加入 ima.qq.com（腾讯自家，已备案）。
 */
import { request } from "./api";
import type { ImaConfig } from "@ielts/core";

const IMA_BASE = "https://ima.qq.com/openapi/wiki/v1";

/** 在用户知识库里检索关键词，返回拼接好的文本片段。 */
export async function searchImaKnowledge(query: string, cfg: ImaConfig): Promise<string> {
  if (!cfg.knowledgeBaseId) {
    throw new Error("NO_KB"); // 未选择知识库，调用方应引导去设置页
  }
  const header = {
    "ima-openapi-clientid": cfg.clientId,
    "ima-openapi-apikey": cfg.apiKey,
  };
  const body: Record<string, unknown> = { query, knowledge_base_id: cfg.knowledgeBaseId, cursor: "" };

  const data = await request({
    url: `${IMA_BASE}/search_knowledge`,
    method: "POST",
    header,
    data: body,
  });
  return formatImaResult(data);
}

/** 列出用户知识库（用于设置页选择知识库 ID）。ima 用 search_knowledge_base（空 query 即列出全部）。
 *  失败抛错，由调用方降级。 */
export async function listImaKnowledgeBases(
  cfg: ImaConfig,
): Promise<Array<{ id: string; name: string }>> {
  const data = await request({
    url: `${IMA_BASE}/search_knowledge_base`,
    method: "POST",
    header: {
      "ima-openapi-clientid": cfg.clientId,
      "ima-openapi-apikey": cfg.apiKey,
    },
    data: { query: "", cursor: "", limit: 50 },
  });
  const list = (data as any)?.data?.info_list ?? (data as any)?.info_list ?? [];
  if (!Array.isArray(list)) return [];
  return list.map((k: any) => ({
    id: String(k.kb_id ?? k.knowledge_base_id ?? k.id ?? ""),
    name: String(k.kb_name ?? k.knowledge_base_name ?? k.name ?? ""),
  }));
}

function formatImaResult(data: unknown): string {
  const items = (data as any)?.data?.info_list ?? (data as any)?.info_list ?? [];
  if (!Array.isArray(items) || items.length === 0) return "知识库中没有相关条目。";
  return items
    .map((it: any, i: number) => {
      const title = it.title ?? it.name ?? "(无标题)";
      const content = it.highlight_content ?? it.content ?? it.text ?? it.snippet ?? "";
      const body = typeof content === "string" ? content.slice(0, 360) : "";
      return `${i + 1}. ${title}\n${body}`;
    })
    .join("\n\n");
}
