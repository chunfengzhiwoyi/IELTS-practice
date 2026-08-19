export default function Loading() {
  return (
    <main className="folio-page" aria-busy="true" aria-label="正在加载">
      <div className="skeleton skeleton--bar" style={{ width: "38%", height: "16px" }} />
      <div className="skeleton skeleton--block" style={{ marginTop: "28px" }} />
      <div className="skeleton skeleton--bar" style={{ width: "72%", marginTop: "20px" }} />
      <div className="skeleton skeleton--bar" style={{ width: "54%", marginTop: "12px" }} />
      <div className="skeleton skeleton--bar" style={{ width: "60%", marginTop: "12px" }} />
    </main>
  );
}
