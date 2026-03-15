import { forwardRef } from 'react';

const InputField = forwardRef(function InputField(
    { label, error, icon: Icon, className = '', type = 'text', ...props },
    ref
) {
    return (
        <div className="flex flex-col gap-1.5">
            {label && (
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                    {label}
                </label>
            )}
            <div className="relative">
                {Icon && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-red-500/60">
                        <Icon size={16} />
                    </span>
                )}
                <input
                    ref={ref}
                    type={type}
                    className={`cyber-input w-full px-4 py-3 text-sm ${Icon ? 'pl-10' : ''} ${className}`}
                    {...props}
                />
            </div>
            {error && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                    <span>⚠</span> {error}
                </p>
            )}
        </div>
    );
});

export default InputField;
