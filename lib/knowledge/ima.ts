/**
 * ima 知识库 OpenAPI 客户端（服务端直连）
 * ------------------------------------------------------------
 * 文档：https://ima.qq.com/openapi/wiki/v1
 * 鉴权 Header：ima-openapi-clientid / ima-openapi-apikey
 * 仅服务端使用（密钥从 user_secrets 解密后注入，不落前端）。
 */
import "server-only";

const IMA_BASE = "https://ima.qq.com/openapi/wiki/v1";

export interface ImaConfig {
  clientId: string;
  apiKey: string;
  knowledgeBaseId?: string;
}

export interface ImaKnowledgeBase {
  id: string;
  name: string;
}

interface ImaRawItem {
  [k: string]: unknown;
}

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
}

function pickList(data: unknown): ImaRawItem[] {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  const inner = obj.data as Record<string, unknown> | undefined;
  const candidates: unknown[] = [
    inner?.["info_list"],
    inner?.["knowledge_base_list"],
    obj["info_list"],
    obj["knowledge_base_list"],
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as ImaRawItem[];
  }
  return [];
}

/** 列出用户知识库（用于设置页选择 knowledge_base_id）。失败抛错。 */
export async function listImaKnowledgeBases(
  cfg: ImaConfig,
): Promise<ImaKnowledgeBase[]> {
  const res = await fetch(`${IMA_BASE}/search_knowledge_base`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ima-openapi-clientid": cfg.clientId,
      "ima-openapi-apikey": cfg.apiKey,
    },
    body: JSON.stringify({ query: "", cursor: "", limit: 50 }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`ima 列表失败 ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json().catch(() => null);
  const list = pickList(data);
  return list.map((k) => ({
    id: asString(k["kb_id"] ?? k["knowledge_base_id"] ?? k["id"]),
    name: asString(k["kb_name"] ?? k["knowledge_base_name"] ?? k["name"]) || "(未命名知识库)",
  }));
}

/** 在用户知识库检索关键词，返回拼接好的文本片段（供助手对话检索上下文）。 */
export async function searchImaKnowledge(query: string, cfg: ImaConfig): Promise<string> {
  if (!cfg.knowledgeBaseId) {
    throw new Error("NO_KB");
  }
  const res = await fetch(`${IMA_BASE}/search_knowledge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ima-openapi-clientid": cfg.clientId,
      "ima-openapi-apikey": cfg.apiKey,
    },
    body: JSON.stringify({ query, knowledge_base_id: cfg.knowledgeBaseId, cursor: "" }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`ima 检索失败 ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json().catch(() => null);
  const items = pickList(data);
  if (!items.length) return "知识库中没有相关条目。";
  return items
    .map((it, i) => {
      const title = asString(it["title"] ?? it["name"]) || "(无标题)";
      const content = it["highlight_content"] ?? it["content"] ?? it["text"] ?? it["snippet"];
      const body = typeof content === "string" ? content.slice(0, 360) : "";
      return `${i + 1}. ${title}\n${body}`;
    })
    .join("\n\n");
}
