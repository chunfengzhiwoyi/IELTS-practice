// Taro 桩：用真实 fetch 发请求，模拟 @tarojs/taro 在真机/小程序里的 request。
const Taro: any = {
  async request(opts: any) {
    const res = await fetch(opts.url, {
      method: opts.method || "POST",
      headers: opts.header || {},
      body: typeof opts.data === "string" ? opts.data : JSON.stringify(opts.data),
      signal: opts.timeout ? (AbortSignal as any).timeout(opts.timeout) : undefined,
    });
    let data: any;
    try {
      data = await res.json();
    } catch {
      data = await res.text();
    }
    return { statusCode: res.status, data };
  },
  showToast() {},
};
export default Taro;
