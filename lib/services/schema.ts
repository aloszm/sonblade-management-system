import { z } from 'zod';
import { MAX_DURATION, MIN_DURATION, DURATION_STEP, SERVICE_CATEGORIES } from './categories';

export const ServiceCategorySchema = z.enum(SERVICE_CATEGORIES, { message: 'Elige una categoría válida: cortes, barba, ceja y facial, paquetes u otros.' });

export const DurationSchema = z.number({ message: 'La duración debe ser un número de minutos.' }).int()
    .min(MIN_DURATION, { message: 'La duración mínima es de 30 minutos.' })
    .max(MAX_DURATION, { message: 'La duración máxima es de 8 horas.' })
    .refine((n) => n % DURATION_STEP === 0, { message: 'La duración debe ser en bloques de 30 minutos (30, 60, 90…).' });

export const SortOrderSchema = z.number({ message: 'El orden debe ser un número entero.' }).int({ message: 'El orden debe ser un número entero.' }).min(0, { message: 'El orden no puede ser negativo.' }).max(100000, { message: 'El orden es demasiado grande.' });
