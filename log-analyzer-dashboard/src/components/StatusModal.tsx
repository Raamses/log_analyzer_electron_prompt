interface StatusModalProps {
  title: string;
  content: string;
  onClose: () => void;
}

const StatusModal = ({ title, content, onClose }: StatusModalProps) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg p-6 max-w-sm w-full">
            <h2 className="text-xl font-bold mb-4">{title}</h2>
            <p>{content}</p>
            <button onClick={onClose} className="mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">Close</button>
        </div>
    </div>
);

export default StatusModal;
