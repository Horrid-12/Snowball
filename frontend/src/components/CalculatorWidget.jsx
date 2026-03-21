import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Delete } from 'lucide-react';

const CalculatorWidget = ({ onClose }) => {
    const [display, setDisplay] = useState('0');
    const [equation, setEquation] = useState('');
    const [isNewNumber, setIsNewNumber] = useState(true);

    React.useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    const handleNumber = (num) => {
        if (isNewNumber) {
            setDisplay(num);
            setIsNewNumber(false);
        } else {
            setDisplay(display === '0' ? num : display + num);
        }
    };

    const handleOperator = (op) => {
        if (!isNewNumber) {
            setEquation(equation + display + ' ' + op + ' ');
            setIsNewNumber(true);
        } else if (equation) {
            // Replace last operator
            setEquation(equation.slice(0, -2) + op + ' ');
        }
    };

    const handleEqual = () => {
        if (!equation && isNewNumber) return;
        
        try {
            // Safe eval alternative for basic math
            const fullEquation = equation + display;
            // eslint-disable-next-line no-new-func
            const result = new Function('return ' + fullEquation)();
            
            // Format to avoid long decimals
            const formattedResult = Number.isInteger(result) ? result.toString() : parseFloat(result.toFixed(6)).toString();
            
            setDisplay(formattedResult);
            setEquation('');
            setIsNewNumber(true);
        } catch (e) {
            setDisplay('Error');
            setEquation('');
            setIsNewNumber(true);
        }
    };

    const handleClear = () => {
        setDisplay('0');
        setEquation('');
        setIsNewNumber(true);
    };

    const handleDelete = () => {
        if (isNewNumber) return;
        if (display.length === 1) {
            setDisplay('0');
            setIsNewNumber(true);
        } else {
            setDisplay(display.slice(0, -1));
        }
    };

    const btnStyle = {
        padding: '1rem',
        fontSize: '1.25rem',
        border: 'none',
        borderRadius: '0.5rem',
        cursor: 'pointer',
        fontWeight: '500',
        transition: 'background 0.2s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    };

    const numStyle = { ...btnStyle, background: 'var(--bg-secondary)', color: 'var(--text-primary)' };
    const opStyle = { ...btnStyle, background: 'rgba(139, 92, 246, 0.15)', color: 'var(--accent-color)' };
    const spStyle = { ...btnStyle, background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger-color)' };
    const eqStyle = { ...btnStyle, background: 'var(--accent-color)', color: 'white' };

    return (
        <motion.div
            drag
            dragMomentum={false}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            style={{
                position: 'fixed',
                bottom: '2rem',
                right: '2rem',
                width: '320px',
                background: 'var(--bg-primary)',
                borderRadius: '1rem',
                border: '1px solid var(--border-color)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
                padding: '1.5rem',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                cursor: 'grab'
            }}
            whileDrag={{ cursor: 'grabbing', scale: 1.02 }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Calculator</span>
                <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.2rem' }}>
                    <X size={18} />
                </button>
            </div>

            <div style={{ 
                background: 'var(--bg-secondary)', 
                padding: '1rem', 
                borderRadius: '0.5rem',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '0.25rem',
                wordBreak: 'break-all'
            }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', minHeight: '1.25rem' }}>
                    {equation}
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                    {display}
                </div>
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '0.5rem'
            }}>
                <button style={spStyle} onClick={handleClear}>C</button>
                <button style={numStyle} onClick={() => setDisplay(display * -1)}>±</button>
                <button style={numStyle} onClick={handleDelete}><Delete size={20} /></button>
                <button style={opStyle} onClick={() => handleOperator('/')}>÷</button>

                <button style={numStyle} onClick={() => handleNumber('7')}>7</button>
                <button style={numStyle} onClick={() => handleNumber('8')}>8</button>
                <button style={numStyle} onClick={() => handleNumber('9')}>9</button>
                <button style={opStyle} onClick={() => handleOperator('*')}>×</button>

                <button style={numStyle} onClick={() => handleNumber('4')}>4</button>
                <button style={numStyle} onClick={() => handleNumber('5')}>5</button>
                <button style={numStyle} onClick={() => handleNumber('6')}>6</button>
                <button style={opStyle} onClick={() => handleOperator('-')}>−</button>

                <button style={numStyle} onClick={() => handleNumber('1')}>1</button>
                <button style={numStyle} onClick={() => handleNumber('2')}>2</button>
                <button style={numStyle} onClick={() => handleNumber('3')}>3</button>
                <button style={opStyle} onClick={() => handleOperator('+')}>+</button>

                <button style={{...numStyle, gridColumn: 'span 2'}} onClick={() => handleNumber('0')}>0</button>
                <button style={numStyle} onClick={() => { if(!display.includes('.')) handleNumber('.') }}>.</button>
                <button style={eqStyle} onClick={handleEqual}>=</button>
            </div>
        </motion.div>
    );
};

export default CalculatorWidget;
