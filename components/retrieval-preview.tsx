import { CheckCircle2, DatabaseZap } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function RetrievalPreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`retrieval-preview ${compact ? "compact" : ""}`}>
      <div className="preview-header"><span><DatabaseZap size={16} />Knowledge Preview</span><Badge><CheckCircle2 size={12} />可验证</Badge></div>
      <div className="preview-query">如何为生产 RAG 建立可验证的质量护栏？</div>
      <div className="preview-route"><span>3 个知识库已响应</span><b>置信度 92%</b></div>
      <div className="preview-answer">
        <strong>建议采用三层质量护栏</strong>
        <p>离线基准确保相关性，在线监控覆盖引用完整率与延迟，预算策略则在账户和 API 密钥层执行双重限额。</p>
        <small>01 · Production RAG Playbook · §4.2</small>
        <small>02 · Agent Reliability Benchmarks · p.18</small>
      </div>
    </div>
  );
}
