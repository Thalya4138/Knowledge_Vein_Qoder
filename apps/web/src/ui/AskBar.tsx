import { useState, type FormEvent } from 'react';
import { Icon } from './Icon';
import { useT } from './prefs';

/** 悬浮的 AI 输入条（示例模式）：提交后如实说明需要接入 API key。 */
export function AskBar({ placeholder }: { placeholder: string }) {
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState(false);
  const t = useT();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setNote(true);
    setDraft('');
  };
  return (
    <div className="askbar">
      {note && (
        <p className="askbar-note" role="status">
          {t('示例模式不会调用模型。接入你自己的 API key 后，可以在这里提问，或让它代你编辑这张图。', 'Sample mode does not call a model. Connect your own API key to ask questions here, or have it edit this map for you.')}
          <button type="button" onClick={() => setNote(false)} aria-label={t('关闭', 'Close')}>
            <Icon name="close" />
          </button>
        </p>
      )}
      <form className="askbar-bar" onSubmit={submit}>
        <label className="sr-only" htmlFor="askbar-input">
          {placeholder}
        </label>
        <input id="askbar-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} autoComplete="off" />
        <button type="submit" aria-label={t('发送', 'Send')} disabled={!draft.trim()}>
          <Icon name="send" />
        </button>
      </form>
    </div>
  );
}
