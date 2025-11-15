interface LogSourceCardProps {
  title: string;
  description: string;
  onSelect: () => void;
}

const LogSourceCard = ({ title, description, onSelect }: LogSourceCardProps) => (
  <div
    className="bg-gray-700 p-6 rounded-lg border-2 border-dashed border-gray-600 hover:border-blue-500 hover:bg-gray-600 cursor-pointer transition-all duration-300"
    onClick={onSelect}
  >
    <h3 className="text-xl font-semibold mb-2">{title}</h3>
    <p className="text-gray-400">{description}</p>
  </div>
);

export default LogSourceCard;
