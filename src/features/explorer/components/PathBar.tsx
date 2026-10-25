import { useState } from "react";
import loglevel from "loglevel";
import { useScrollToEnd } from "../../../hooks/useScrollToEnd";
import { completePath } from "../../../services/tauriApi";
import { commonPrefix } from "../../../utils/strings";
import type { ChangeEvent, KeyboardEvent, ReactElement } from "react";

/** この機能のロガー. */
const log = loglevel.getLogger("explorer");

/**
 * PathBar コンポーネントのプロパティ.
 */
interface PathBarProps {
  /** 表示中のパス. */
  path: string;
  /** Enter 押下時のハンドラー. 入力中の文字列が渡される. */
  onSubmit: (value: string) => void;
  /** 入力欄の要素を受け取る ref コールバック. */
  inputRef: (element: HTMLInputElement | null) => void;
  /** 入力欄のアクセシブルな名前. */
  label: string;
}

/**
 * 補完候補のパスから, 一覧に表示する名前 (最後のディレクトリ名と末尾の区切り) を取り出します.
 *
 * @param candidate - 補完候補のパス (末尾に `/` が付く. 例: `/home/user/src/`).
 * @returns 表示する名前 (例: `src/`).
 */
function candidateLabel(candidate: string): string {
  const trimmed = candidate.replace(/[/\\]$/, "");
  const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return candidate.slice(index + 1);
}

/**
 * カレントパスの表示・直接入力バー. 入力中の文字列は, Enter で確定するまでペインの状態へ反映しません.
 * 呼び出し側は, 表示中のパスが変わったときに入力を作り直せるよう, パスを `key` に指定します.
 *
 * 長いパスが入り切らないときは, いま開いているディレクトリ (末尾) が見えるようにして, 全体を
 * ツールチップ (`title`) でも確認できるようにします. 編集中 (フォーカスがある間) は, 通常の入力欄と同じです.
 *
 * `Tab` で, サブディレクトリ名を補完します. 候補が複数あるときは, 共通の先頭部分まで補完して,
 * 入力欄の下に候補の一覧を出します. 一覧が出ている間は, `Tab` / `Shift+Tab` / `↓` / `↑` で候補を選び
 * (選んだ候補が入力欄に入る), `Enter` でその候補へ移動します. `Esc` は, 一覧を閉じます (もう一度押すと,
 * 編集を取り消します). 候補のクリックでも選べます. 文字を入力する・フォーカスが外れると, 一覧は閉じます.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns 入力欄と候補の一覧のReact要素.
 */
export default function PathBar({
  path,
  onSubmit,
  inputRef,
  label,
}: PathBarProps): ReactElement {
  const [draft, setDraft] = useState(path);
  /** 補完候補の一覧. 閉じているときは空. */
  const [candidates, setCandidates] = useState<string[]>([]);
  /** 一覧で選んでいる候補の位置. 選んでいないときは -1. */
  const [selected, setSelected] = useState(-1);
  const { ref, scrollToEnd } = useScrollToEnd<HTMLInputElement>(path);
  const listOpen = candidates.length > 0;

  /** 一覧を閉じる. */
  const closeList = (): void => {
    setCandidates([]);
    setSelected(-1);
  };

  /** 一覧の候補を選んで, 入力欄に入れる. 先頭と末尾は, つなげて回る. */
  const select = (index: number): void => {
    const next = (index + candidates.length) % candidates.length;
    setSelected(next);
    setDraft(candidates[next]);
  };

  /** 入力中のパスを補完する. 共通の先頭部分まで補完して, 候補が複数あれば一覧を出す. */
  const complete = (): void => {
    completePath(draft)
      .then((found) => {
        const prefix = commonPrefix(found);
        if (prefix.length > draft.length) {
          setDraft(prefix);
        }
        setCandidates(found.length > 1 ? found : []);
        setSelected(-1);
      })
      .catch((err) => log.warn("パス補完に失敗:", err));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") {
      onSubmit(draft);
      closeList();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      if (listOpen) {
        closeList();
        return;
      }
      setDraft(path);
      e.currentTarget.blur();
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (listOpen) {
        select(selected + (e.shiftKey ? -1 : 1));
      } else {
        complete();
      }
    } else if (listOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      select(selected + (e.key === "ArrowDown" ? 1 : -1));
    }
  };

  return (
    <div className="path-bar-wrap">
      <input
        type="text"
        ref={(element) => {
          ref.current = element;
          inputRef(element);
        }}
        title={path}
        onBlur={() => {
          scrollToEnd();
          closeList();
        }}
        aria-label={label}
        aria-expanded={listOpen}
        aria-controls={listOpen ? `${label}-candidates` : undefined}
        value={draft}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          setDraft(e.target.value);
          closeList();
        }}
        onKeyDown={handleKeyDown}
        className="path-bar"
      />
      {listOpen && (
        <ul
          id={`${label}-candidates`}
          role="listbox"
          aria-label={`${label} candidates`}
          className="path-candidates"
        >
          {candidates.map((candidate, index) => (
            <li
              key={candidate}
              role="option"
              aria-selected={index === selected}
              data-selected={index === selected}
              title={candidate}
              ref={(el) => {
                if (el && index === selected) {
                  el.scrollIntoView?.({ block: "nearest" });
                }
              }}
              // クリックで入力欄のフォーカスが外れて一覧が閉じないよう, フォーカスの移動を止める.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setDraft(candidate);
                closeList();
              }}
            >
              {candidateLabel(candidate)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
