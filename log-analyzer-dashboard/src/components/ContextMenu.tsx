import React from 'react';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onSelect: (option: string) => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onClose, onSelect }) => {
  const menuItems = ['Whois Lookup', 'Threat Intelligence'];

  return (
    <div
      className="fixed bg-gray-800 border border-gray-700 rounded-md shadow-lg z-50"
      style={{ top: y, left: x }}
    >
      <ul>
        {menuItems.map(item => (
          <li
            key={item}
            className="px-4 py-2 hover:bg-gray-700 cursor-pointer"
            onClick={() => {
              onSelect(item);
              onClose();
            }}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ContextMenu;
