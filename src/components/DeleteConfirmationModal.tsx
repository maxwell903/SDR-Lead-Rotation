interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
}

const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  title
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-2xl border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
        <div className="flex space-x-3">
          <button
            onClick={onConfirm}
            className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-all font-medium"
          >
            Yes
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition-all font-medium"
          >
            No
          </button>
        </div>
      </div>
    </div>
  );
};