'use client';

import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, User, Plus } from 'lucide-react';
import { useSupabase } from '@/hooks/useSupabase';
import { supabaseAdmin as supabase } from '@/lib/supabase';

// Helper function to get days in month
function getDaysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
}

// Helper function to get the first day of the month (0 = Sunday, 1 = Monday, etc.)
function getFirstDayOfMonth(year: number, month: number) {
    return new Date(year, month, 1).getDay();
}

export default function AppointmentsPage() {
    // Current actual date for highlighting "Today"
    const today = new Date();

    // State for the currently viewed month/year in the calendar
    const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
    const [selectedDate, setSelectedDate] = useState<Date>(today);

    const [appointments, setAppointments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const daysInMonth = getDaysInMonth(year, month);
    // getDay() naturally returns 0 for Sunday
    const firstDay = getFirstDayOfMonth(year, month);

    const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    // Days of the week starting from Sunday
    const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    const prevMonth = () => {
        setCurrentDate(new Date(year, month - 1, 1));
    };

    const nextMonth = () => {
        setCurrentDate(new Date(year, month + 1, 1));
    };

    const isToday = (day: number) => {
        return today.getDate() === day &&
            today.getMonth() === month &&
            today.getFullYear() === year;
    };

    const isSelected = (day: number) => {
        return selectedDate.getDate() === day &&
            selectedDate.getMonth() === month &&
            selectedDate.getFullYear() === year;
    };

    const handleDateClick = (day: number) => {
        setSelectedDate(new Date(year, month, day));
    };

    // Build the calendar grid
    const days = [];
    // Padding for days before the 1st
    for (let i = 0; i < firstDay; i++) {
        days.push(<div key={`empty-${i}`} className="h-24 md:h-32 p-2 border border-gray-100 bg-gray-50/50"></div>);
    }

    // Actual days of the month
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayApts = appointments.filter(a => a.scheduled_at.startsWith(dateStr));

        days.push(
            <div
                key={`day-${d}`}
                onClick={() => handleDateClick(d)}
                className={`h-24 md:h-32 p-2 border border-gray-100 relative cursor-pointer transition-colors overflow-hidden group hover:border-sonblade-gold/50
                ${isSelected(d) ? 'bg-sonblade-gold/5 ring-1 ring-inset ring-sonblade-gold' : 'bg-white hover:bg-gray-50'}`}
            >
                <div className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full mb-1
                    ${isToday(d) ? 'bg-sonblade-primary text-white font-bold' : isSelected(d) ? 'bg-sonblade-gold text-black' : 'text-gray-700'}`}>
                    {d}
                </div>

                <div className="space-y-1 overflow-y-auto no-scrollbar max-h-[60px] md:max-h-[80px]">
                    {dayApts.map(apt => (
                        <div key={apt.id} className="text-[10px] md:text-xs px-1.5 py-1 rounded bg-sonblade-light text-sonblade-primary border border-sonblade-gold/20 truncate" title={`${apt.client_name} - ${new Date(apt.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}>
                            {new Date(apt.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {apt.client_name}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Always fill to exactly 35 or 42 slots to keep the grid even
    const totalSlots = days.length > 35 ? 42 : 35;
    const remainingSlots = totalSlots - days.length;
    for (let i = 0; i < remainingSlots; i++) {
        days.push(<div key={`empty-end-${i}`} className="h-24 md:h-32 p-2 border border-gray-100 bg-gray-50/50"></div>);
    }

    // Fetch appointments
    useEffect(() => {
        const fetchApts = async () => {
            // In a real app we'd fetch directly from an API route or supabase client
            // We'll mock it temporarily until we verify the database schema for appointments
            setAppointments([
                { id: 1, client_name: 'Example Appointment', scheduled_at: today.toISOString(), status: 'pending' }
            ]);
            setLoading(false);
        };
        fetchApts();
    }, [month, year]);

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <CalendarIcon className="h-6 w-6 text-sonblade-gold" />
                        Calendario
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Gestiona las reservas de tus clientes</p>
                </div>

                <div className="flex items-center gap-4">
                    <button className="bg-sonblade-primary text-sonblade-gold px-4 py-2 rounded-lg text-sm font-medium hover:bg-black transition-colors flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        Nueva Cita
                    </button>
                    <div className="flex items-center bg-white border border-gray-200 rounded-lg shadow-sm">
                        <button onClick={prevMonth} className="p-2 hover:bg-gray-50 rounded-l-lg border-r border-gray-200">
                            <ChevronLeft className="h-5 w-5 text-gray-600" />
                        </button>
                        <div className="px-4 py-2 font-semibold w-40 text-center text-gray-800 capitalize">
                            {monthNames[month]} {year}
                        </div>
                        <button onClick={nextMonth} className="p-2 hover:bg-gray-50 rounded-r-lg border-l border-gray-200">
                            <ChevronRight className="h-5 w-5 text-gray-600" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Days of week header */}
                <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
                    {weekDays.map((day, i) => (
                        <div key={day} className={`text-center py-3 text-xs font-bold uppercase tracking-wider ${i === 0 ? 'text-red-500' : 'text-gray-500'}`}>
                            {day}
                        </div>
                    ))}
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7">
                    {days}
                </div>
            </div>

            <div className="mt-8 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="font-bold text-gray-900 mb-4 capitalize border-b pb-2">
                    Citas del {selectedDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                </h3>
                {appointments.filter(a => a.scheduled_at.startsWith(selectedDate.toISOString().split('T')[0])).length > 0 ? (
                    <div className="space-y-3">
                        {appointments.filter(a => a.scheduled_at.startsWith(selectedDate.toISOString().split('T')[0])).map(apt => (
                            <div key={apt.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                                <div className="flex items-center gap-3">
                                    <div className="bg-sonblade-gold/20 p-2 rounded-full">
                                        <User className="h-4 w-4 text-sonblade-gold" />
                                    </div>
                                    <div>
                                        <p className="font-semibold text-gray-900">{apt.client_name}</p>
                                        <p className="text-xs text-gray-500">{apt.status}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 text-gray-600 font-medium">
                                    <Clock className="h-4 w-4" />
                                    {new Date(apt.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-gray-500 text-sm italic">No hay citas programadas para este día.</p>
                )}
            </div>
        </div>
    );
}
