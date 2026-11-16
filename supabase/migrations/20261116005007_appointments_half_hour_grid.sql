-- Agenda en bloques de 30 minutos: una cita agendada nueva (o que cambia de hora o de duración) empieza a la hora
-- en punto o a la media hora, en la hora de la barbería, y dura un múltiplo de 30 minutos.
-- Quedan fuera los registros walk_in que crea el cobro y las citas que ya existen mientras no cambien de hora ni duración.
-- Se extiende private.appointments_within_hours (el trigger que ya valida el horario) reemplazando fragmentos.
do $do$
declare
  v_def text := pg_get_functiondef('private.appointments_within_hours()'::regprocedure);
  v_old_decl constant text := E'  v_name text;\n';
  v_new_decl constant text := E'  v_name text;\n  v_grid boolean;\n';
  v_old_dow constant text := E'  v_dow := extract(dow from v_start)::integer;\n';
  v_new_dow constant text := E'  v_dow := extract(dow from v_start)::integer;\n'
    || E'\n'
    || E'  -- Bloques de 30 minutos: solo citas nuevas o que cambian de hora o de duración.\n'
    || E'  if tg_op = ''INSERT'' then\n'
    || E'    v_grid := true;\n'
    || E'  else\n'
    || E'    v_grid := old.scheduled_start_at is distinct from new.scheduled_start_at or old.scheduled_end_at is distinct from new.scheduled_end_at;\n'
    || E'  end if;\n'
    || E'  if v_grid then\n'
    || E'    if extract(minute from v_start) not in (0, 30) or extract(second from v_start) <> 0 then\n'
    || E'      raise exception ''Las citas empiezan a la hora en punto o a la media hora (por ejemplo, 10:00 o 10:30).'' using errcode = ''23514'';\n'
    || E'    end if;\n'
    || E'    if new.scheduled_end_at is not null and (new.scheduled_end_at <= new.scheduled_start_at\n'
    || E'       or mod(extract(epoch from (new.scheduled_end_at - new.scheduled_start_at)), 1800) <> 0) then\n'
    || E'      raise exception ''La cita debe durar 30 minutos o un múltiplo de 30 (por ejemplo, 1 hora o 1 hora y media).'' using errcode = ''23514'';\n'
    || E'    end if;\n'
    || E'  end if;\n';
begin
  if md5(v_def) <> '4bc3e0ea2e5a8fa970e719cdd680eb79' then
    raise exception 'La función del horario de citas cambió desde que se leyó; revisa antes de modificarla.';
  end if;
  if (length(v_def) - length(replace(v_def, v_old_decl, ''))) / length(v_old_decl) <> 1 then
    raise exception 'El fragmento de declaración no aparece exactamente una vez.';
  end if;
  if (length(v_def) - length(replace(v_def, v_old_dow, ''))) / length(v_old_dow) <> 1 then
    raise exception 'El fragmento del día de la semana no aparece exactamente una vez.';
  end if;
  execute replace(replace(v_def, v_old_decl, v_new_decl), v_old_dow, v_new_dow);
end
$do$;
