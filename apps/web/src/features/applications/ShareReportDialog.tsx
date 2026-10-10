import { useEffect, useMemo, useRef, useState } from "react";
import type { ApplicationSyncItem } from "@offerflow/contracts";
import { Download, LoaderCircle, Share2 } from "lucide-react";
import { Modal } from "../agents/Modal";
import { buildApplicationReport } from "./applicationReport";
import { drawReportCard, reportCardBlob } from "./reportCard";

function reportFileName(): string {
  const today = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `JobKoI-投递战报-${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}.png`;
}

export function ShareReportDialog({ items, onClose }: { items: ApplicationSyncItem[]; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const report = useMemo(() => buildApplicationReport(items.filter((item) => !item.deletedAt).map((item) => item.application)), [items]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  // Phones can hand the PNG straight to Xiaohongshu through the system share sheet; desktops download it.
  const [canShareFiles] = useState(() => {
    try {
      const probe = new File([new Blob()], "probe.png", { type: "image/png" });
      return typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] });
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !report) return;
    let active = true;
    void drawReportCard(canvas, report).then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, [report]);

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    try {
      const url = URL.createObjectURL(await reportCardBlob(canvas));
      const link = document.createElement("a");
      link.href = url;
      link.download = reportFileName();
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("图片已保存，可以发到小红书了。");
    } catch {
      setStatus("图片生成失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    try {
      const file = new File([await reportCardBlob(canvas)], reportFileName(), { type: "image/png" });
      await navigator.share({ files: [file] });
      setStatus("");
    } catch (error) {
      // Closing the share sheet rejects with AbortError; that is not a failure.
      if (!(error instanceof DOMException && error.name === "AbortError")) setStatus("分享没有成功，可以先保存图片再手动发布。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} labelledBy="share-report-title" className="share-report-dialog">
      <div className="share-report">
        <header className="share-report__header">
          <h2 id="share-report-title">投递战报</h2>
          <p>根据你的全部投递生成。发出去之前，先确认一遍公司名单。</p>
        </header>
        {report ? (
          <>
            <div className="share-report__preview" aria-busy={!ready}>
              <canvas
                ref={canvasRef}
                role="img"
                aria-label={`${report.title}：投递 ${report.counts.applied}，测评 ${report.counts.assessment}，面试 ${report.counts.interview}，Offer ${report.counts.offer}`}
              />
              {!ready && <LoaderCircle className="spin share-report__spinner" aria-hidden="true" size={22} />}
            </div>
            <div className="share-report__actions">
              {canShareFiles && (
                <button className="secondary-button" type="button" disabled={!ready || busy} onClick={() => void share()}>
                  <Share2 aria-hidden="true" size={16} />分享
                </button>
              )}
              <button className="primary-button" type="button" disabled={!ready || busy} onClick={() => void save()}>
                <Download aria-hidden="true" size={16} />保存图片
              </button>
            </div>
            <p className="share-report__status" role="status">{status}</p>
          </>
        ) : (
          <p className="share-report__empty">还没有已投递的记录。把至少一条投递改成「已投递」或之后的阶段，就能生成战报。</p>
        )}
      </div>
    </Modal>
  );
}
