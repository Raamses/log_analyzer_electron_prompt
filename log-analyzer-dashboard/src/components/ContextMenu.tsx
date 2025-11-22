import type { FC, PropsWithChildren } from 'react';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
}

const ContextMenu: FC<PropsWithChildren<ContextMenuProps>> = ({ children, x, y, onClose }) => {
  return (
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        className="absolute bg-gray-800 border border-gray-700 rounded-md shadow-lg py-1"
        style={{ top: y, left: x }}
      >
        {children}
      </div>
    </div>
  );
};

export const ContextMenuItem: FC<PropsWithChildren<{ onClick: () => void }>> = ({ children, onClick }) => {
  return (
    <div
      className="px-4 py-2 text-sm text-gray-300 hover:bg-primary hover:text-white cursor-pointer"
      onClick={onClick}
    >
      {children}
    </div>
  );
};

export default ContextMenu;
