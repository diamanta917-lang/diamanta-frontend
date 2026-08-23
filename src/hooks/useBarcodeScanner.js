import { useEffect, useRef, useState } from 'react';

/**
 * Hook para interceptar lecturas de lectores de códigos de barras USB
 * Los lectores USB funcionan como teclados rápidos
 */
export const useBarcodeScanner = (onScanComplete) => {
    const [barcode, setBarcode] = useState('');
    const bufferRef = useRef('');
    const timerRef = useRef(null);
    const lastKeyTimeRef = useRef(0);

    useEffect(() => {
        const handleKeyDown = (e) => {
            const currentTime = Date.now();
            const timeDiff = currentTime - lastKeyTimeRef.current;
            lastKeyTimeRef.current = currentTime;

            // Si es Enter y hay buffer suficiente, es un escaneo completo
            if (e.key === 'Enter' && bufferRef.current.length >= 3) {
                e.preventDefault();
                e.stopPropagation();

                // Ejecutar callback con el código escaneado
                onScanComplete(bufferRef.current);

                // Limpiar buffer
                bufferRef.current = '';
                setBarcode('');
                return;
            }

            // Ignorar teclas de control (Shift, Ctrl, Alt, etc.)
            if (e.key.length !== 1) return;

            // Si el tiempo entre teclas es muy corto (< 30ms), es probable que sea un escáner
            // Si es largo (> 100ms), es tipeo humano
            if (timeDiff < 100) {
                bufferRef.current += e.key;
                setBarcode(bufferRef.current);

                // Limpiar buffer si pasa mucho tiempo sin nueva tecla
                clearTimeout(timerRef.current);
                timerRef.current = setTimeout(() => {
                    // Si el buffer es corto, probablemente fue tipeo humano, limpiar
                    if (bufferRef.current.length < 5) {
                        bufferRef.current = '';
                        setBarcode('');
                    }
                }, 150);
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            clearTimeout(timerRef.current);
        };
    }, [onScanComplete]);

    return barcode;
};