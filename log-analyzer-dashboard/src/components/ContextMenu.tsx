import type { FC, PropsWithChildren, ReactNode } from 'react';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
}

const ContextMenu: FC<PropsWithChildren<ContextMenuProps>> = ({ children, x, y, onClose }) => {
  return (
    <div
      className="fixed inset-0 z-50 cursor-default select-none"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        className="absolute bg-slate-950/95 backdrop-blur-lg border border-slate-800/80 rounded-xl shadow-2xl py-1.5 min-w-[200px] animate-fade-in z-50 divide-y divide-slate-900/50"
        style={{ top: `${y}px`, left: `${x}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};

interface ContextMenuItemProps {
  onClick: () => void;
  disabled?: boolean;
  icon?: ReactNode;
}

export const ContextMenuItem: FC<PropsWithChildren<ContextMenuItemProps>> = ({
  children,
  onClick,
  disabled = false,
  icon,
}) => {
  return (
    <button
      disabled={disabled}
      className={`w-full px-4 py-2 text-xs font-semibold font-sans tracking-wide cursor-pointer transition-colors flex items-center gap-2.5 text-left focus:outline-none ${
        disabled
          ? 'text-slate-600 cursor-not-allowed bg-transparent'
          : 'text-slate-300 hover:bg-indigo-500/20 hover:text-indigo-400 active:bg-indigo-500/30'
      }`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) {
          onClick();
        }
      }}
    >
      {icon && <span className={`flex-shrink-0 ${disabled ? 'text-slate-700' : 'text-indigo-400/80 group-hover:text-indigo-400'}`}>{icon}</span>}
      <span className="flex-1">{children}</span>
    </button>
  );
};

export default ContextMenu;

