import { useState } from 'react';
import type { Action, PreviewState, UiSpec } from '../contracts';
import { Preview } from '../ui/Preview';

/** The editable React entry point included in the exported source project. */
export function SourceApp({ spec }: { spec: UiSpec }) {
  const [state, setState] = useState<PreviewState>(() => ({
    sessionId: spec.sessionId,
    activeScreenId: spec.screens[0].id,
    values: {}, forms: {}, filters: {}, submitted: {},
  }));
  function onAction(action: Action, componentId?: string) {
    setState(previous => {
      const next = { ...previous, values: { ...previous.values }, filters: { ...previous.filters }, submitted: { ...previous.submitted } };
      switch (action.type) {
        case 'navigate': next.activeScreenId = action.screenId; break;
        case 'setState': next.values[action.key] = action.value; break;
        case 'filter':
          next.filters[action.dataKey] = { field: action.field, stateKey: action.stateKey };
          Object.assign(next.values, componentId ? previous.forms[componentId] : {});
          break;
        case 'submitDemoForm':
          {
            const target = spec.screens.flatMap(screen => screen.components).find(component => component.id === action.formId);
            if (target?.type !== 'form' || !target.properties.fields.every(field => {
              const value = previous.forms[action.formId]?.[field.id] ?? '';
              if (field.required && !value.trim()) return false;
              if (field.type === 'select') return !value && !field.required || Boolean(field.options?.includes(value));
              const input = document.createElement('input');
              input.type = field.type;
              input.required = field.required;
              if (field.type === 'number') { input.min = '1'; input.step = '1'; }
              input.value = value;
              return (!value || Boolean(input.value)) && input.checkValidity();
            })) return previous;
          }
          next.values[action.resultStateKey] = 'submitted';
          next.submitted[action.formId] = 'Demo request received locally. Nothing was sent to a server.';
          break;
      }
      return next;
    });
  }
  return <Preview spec={spec} state={state} onAction={onAction} onFieldChange={(componentId, fieldId, value) => {
    setState(previous => ({ ...previous, forms: { ...previous.forms, [componentId]: { ...previous.forms[componentId], [fieldId]: value } } }));
  }} />;
}
