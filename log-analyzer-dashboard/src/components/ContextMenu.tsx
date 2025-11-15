import { useEffect, useRef } from 'react';

interface ContextMenuProps {
    x: number;
    y: number;
    onClose: () => void;
    onLookup: () => void;
}

const ContextMenu = ({ x, y, onClose, onLookup }: ContextMenuProps) => {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    return (
        <div
            ref={menuRef}
            className="fixed bg-card text-card-foreground rounded-md shadow-lg p-2 text-sm z-50"
            style={{ top: y, left: x }}
        >
            <div
                className="px-3 py-1 hover:bg-secondary/10 rounded-md cursor-pointer"
                onClick={onLookup}
            >
                Whois Lookup
            </div>
        </div>
    );
};

export default ContextMenu;
