import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Dialog } from "@offerflow/ui";
import type { ProductFeedbackCategory } from "@offerflow/contracts";
import { CheckCircle2, LoaderCircle, Send, Sparkles } from "lucide-react";
import { api } from "../app/api";

const categories: Array<{ value: ProductFeedbackCategory; label: string }> = [
  { value: "suggestion", label: "功能建议" },
  { value: "issue", label: "使用问题" },
  { value: "content", label: "内容纠错" },
  { value: "other", label: "其他想法" }
];

export function FeedbackDialog({ open, onClose, pagePath }: { open: boolean; onClose: () => void; pagePath: string }) {
  const formId = useId();
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [category, setCategory] = useState<ProductFeedbackCategory>("suggestion");
  const [content, setContent] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || submitted) return;
    const frame = window.requestAnimationFrame(() => contentRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, submitted]);

  const close = () => {
    onClose();
    window.setTimeout(() => {
      setSubmitted(false);
      setError("");
    }, 180);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const feedbackContent = content.trim();
    if (feedbackContent.length < 4) {
      setError("请至少写 4 个字，让我们更准确地理解你的想法。");
      return;
    }
    setSubmitting(true);
    try {
      await api.feedback.create({
        category,
        content: feedbackContent,
        contact: contact.trim() || undefined,
        pagePath
      });
      setSubmitted(true);
      setContent("");
      setContact("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "暂时无法提交。请检查网络后重试。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      className="feedback-dialog"
      title={submitted ? "反馈已收到" : "一起完善 JobKoI"}
      description={submitted ? "谢谢你参与共建，每一条反馈都会进入产品改进清单。" : "还不够好用的地方，欢迎直接告诉我们。"}
      footer={submitted ? (
        <button className="feedback-secondary-action" type="button" onClick={close}>继续浏览</button>
      ) : (
        <>
          <button className="feedback-secondary-action" type="button" onClick={close}>暂不反馈</button>
          <button className="feedback-submit" type="submit" form={formId} disabled={submitting}>
            {submitting ? <LoaderCircle className="spin" aria-hidden="true" size={16} /> : <Send aria-hidden="true" size={16} />}
            {submitting ? "正在提交" : "提交反馈"}
          </button>
        </>
      )}
    >
      {submitted ? (
        <section className="feedback-success" role="status">
          <span><CheckCircle2 aria-hidden="true" size={30} /></span>
          <div>
            <strong>你的声音已经抵达</strong>
            <p>我们会认真阅读，并优先关注重复出现的问题与建议。</p>
          </div>
        </section>
      ) : (
        <form id={formId} className="feedback-form" onSubmit={submit}>
          <fieldset>
            <legend>反馈类型</legend>
            <div className="feedback-category-grid">
              {categories.map((item) => (
                <label key={item.value}>
                  <input
                    type="radio"
                    name="feedback-category"
                    value={item.value}
                    checked={category === item.value}
                    onChange={() => setCategory(item.value)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="feedback-field" htmlFor={`${formId}-content`}>
            <span>想告诉我们什么？</span>
            <textarea
              ref={contentRef}
              id={`${formId}-content`}
              value={content}
              minLength={4}
              maxLength={2000}
              required
              autoFocus
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${formId}-error` : `${formId}-hint`}
              placeholder="例如：我希望简历中心可以……；在这个页面我遇到了……"
              onChange={(event) => setContent(event.target.value)}
            />
            <small id={`${formId}-hint`}>写得越具体，越有机会进入下一轮改进。</small>
          </label>

          <label className="feedback-field" htmlFor={`${formId}-contact`}>
            <span>联系方式 <em>选填</em></span>
            <input
              id={`${formId}-contact`}
              value={contact}
              maxLength={160}
              placeholder="邮箱、微信或 QQ，方便我们向你追问"
              onChange={(event) => setContact(event.target.value)}
            />
          </label>

          <p className="feedback-co-creation"><Sparkles aria-hidden="true" size={15} />共建不是口号：你的反馈会和其他用户的声音一起影响改进优先级。</p>
          <p className="feedback-error" id={`${formId}-error`} role="alert">{error}</p>
        </form>
      )}
    </Dialog>
  );
}
