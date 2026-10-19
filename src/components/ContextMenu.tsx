import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";

/**
 * ContextMenu の 1 項目.
 */
export interface ContextMenuItem {
  /** 表示する文字列. */
  label: string;
  /** 選んだときのハンドラー. */
  onSelect: () => void;
}

/**
 * ContextMenu コンポーネントのプロパティ.
 */
interface ContextMenuProps {
  /** 表示する位置 (画面の左上からの x 座標. 右クリックした位置). */
  x: number;
  /** 表示する位置 (画面の左上からの y 座標. 右クリックした位置). */
  y: number;
  /** 項目. */
  items: ContextMenuItem[];
  /** 閉じる要求 (項目を選んだ, `Esc`, メニューの外のクリック) のハンドラー. */
  onClose: () => void;
}

/**
 * 右クリックのメニュー. 右クリックした位置に, 画面からはみ出さないように表示します.
 *
 * `↑` `↓` (`k` `j`) で項目を選び, `Enter` で実行します. 項目のクリックでも実行します.
 * `Esc` と, メニューの外のクリック (右クリックも) で閉じます.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns メニューのReact要素.
 */
export default function ContextMenu({
  x,
  y,
  items,
  onClose,
}: ContextMenuProps): ReactElement {
  const ref = useRef<HTMLUListElement>(null);
  const [selected, setSelected] = useState(0);
  const [position, setPosition] = useState({ left: x, top: y });

  // 画面の右や下にはみ出すときは, はみ出さない位置まで戻す.
  // レイアウトの後に呼ばれるので, ref は必ず要素を指している.
  useLayoutEffect(() => {
    const { offsetWidth, offsetHeight } = ref.current as HTMLUListElement;
    setPosition({
      left: Math.max(0, Math.min(x, window.innerWidth - offsetWidth)),
      top: Math.max(0, Math.min(y, window.innerHeight - offsetHeight)),
    });
  }, [x, y]);

  useEffect(() => {
    const choose = (index: number): void => {
      onClose();
      items[index].onSelect();
    };
    const handleKeyDown = (e: KeyboardEvent): void => {
      // メニューを開いている間は, ほかのキー操作 (一覧のカーソル移動など) に渡さない.
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape" || (e.ctrlKey && e.key === "g")) {
        onClose();
      } else if (e.key === "ArrowDown" || e.key === "j") {
        setSelected((i) => (i + 1) % items.length);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        setSelected((i) => (i - 1 + items.length) % items.length);
      } else if (e.key === "Enter") {
        choose(selected);
      }
    };
    const handleMouseDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("mousedown", handleMouseDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("mousedown", handleMouseDown, true);
    };
  }, [items, selected, onClose]);

  return (
    <ul
      ref={ref}
      role="menu"
      className="context-menu"
      style={{ left: position.left, top: position.top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, index) => (
        <li
          key={item.label}
          role="menuitem"
          className="context-menu-item"
          data-selected={index === selected}
          onMouseEnter={() => setSelected(index)}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.label}
        </li>
      ))}
    </ul>
  );
}
