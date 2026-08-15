import { CheckCircle2, Search, Waypoints } from "lucide-react";

export function RetrievalPreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`retrieval-preview ${compact ? "compact" : ""}`}>
      <div className="preview-header">
        <span className="window-dots">
          <i />
          <i />
          <i />
        </span>
        <span>Knowledge Preview</span>
      </div>
      <div className="preview-query">
        <Search size={15} />
        如何为生产 RAG 建立可验证的质量护栏？
      </div>
      <div className="preview-route">
        <span>
          <Waypoints size={14} />3 个知识库已响应
        </span>
        <b>置信度&nbsp; 92%</b>
      </div>
      <div className="preview-answer">
        <div className="preview-answer-title">
          <strong>建议采用三层质量护栏</strong>
          <span>
            <CheckCircle2 size={13} />
            可验证
          </span>
        </div>
        <p>
          离线基准确保相关性，在线监控覆盖引用完整率与延迟，预算策略则在账户和
          API 密钥层执行双重限额。
        </p>
        <small>
          <b>01</b> Production RAG Playbook · §4.2
        </small>
        <small>
          <b>02</b> Agent Reliability Benchmarks · p.18
        </small>
      </div>
    </div>
  );
}
