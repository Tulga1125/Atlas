"use client";
import { useActionState, useId, useState } from "react";
import {
  workflowAction,
  type WorkflowState,
} from "@/app/dashboard/workflow-actions";
export type WorkflowField = {
  name: string;
  label: string;
  value?: string;
  type?:
    | "text"
    | "textarea"
    | "select"
    | "checkboxes"
    | "datetime-local"
    | "url";
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
};
export function WorkflowForm({
  hidden,
  fields = [],
  button,
  disabled = false,
  executeLabel = "Apply reviewed change",
}: {
  hidden: Record<string, string>;
  fields?: WorkflowField[];
  button: string;
  disabled?: boolean;
  executeLabel?: string;
}) {
  const formId = useId();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((field) => [
        field.name,
        field.value ??
          (field.type === "select" ? (field.options?.[0]?.value ?? "") : ""),
      ]),
    ),
  );
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const setValue = (name: string, value: string) =>
    setValues((previous) => ({ ...previous, [name]: value }));
  const [state, action, pending] = useActionState(workflowAction, {
    status: "idle",
  } as WorkflowState);
  return (
    <form
      action={action}
      onReset={(event) => event.preventDefault()}
      className="workflow-form"
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {fields.map((field) => (
        <div className="workflow-field" key={field.name}>
          <label htmlFor={`${formId}-${field.name}`}>{field.label}</label>
          {field.type === "checkboxes" ? (
            <span className="recording-options">
              {field.options?.map((o) => (
                <label key={o.value}>
                  <input
                    type="checkbox"
                    name={field.name}
                    value={o.value}
                    checked={(selected[field.name] ?? []).includes(o.value)}
                    onChange={(event) =>
                      setSelected((previous) => ({
                        ...previous,
                        [field.name]: event.target.checked
                          ? [...(previous[field.name] ?? []), o.value]
                          : (previous[field.name] ?? []).filter(
                              (value) => value !== o.value,
                            ),
                      }))
                    }
                  />
                  {o.label}
                </label>
              ))}
            </span>
          ) : field.type === "textarea" ? (
            <textarea
              id={`${formId}-${field.name}`}
              aria-label={field.label}
              name={field.name}
              value={values[field.name] ?? ""}
              onChange={(event) => setValue(field.name, event.target.value)}
              required={field.required}
              maxLength={100000}
              rows={field.name.startsWith("body") ? 12 : 3}
            />
          ) : field.type === "select" ? (
            <select
              id={`${formId}-${field.name}`}
              aria-label={field.label}
              name={field.name}
              value={values[field.name] ?? ""}
              onChange={(event) => setValue(field.name, event.target.value)}
              required={field.required}
            >
              {field.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`${formId}-${field.name}`}
              aria-label={field.label}
              name={field.name}
              type={field.type ?? "text"}
              value={values[field.name] ?? ""}
              onChange={(event) => setValue(field.name, event.target.value)}
              required={field.required}
              maxLength={2048}
            />
          )}
        </div>
      ))}
      <button type="submit" disabled={disabled || pending}>
        {pending ? "…" : button}
      </button>
      {state.message && (
        <p role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      )}
      {state.preview && <pre className="evidence-block">{state.preview}</pre>}
      {state.fingerprint && (
        <input type="hidden" name="fingerprint" value={state.fingerprint} />
      )}
      {state.fingerprint && (
        <button
          type="submit"
          name="execute"
          value="yes"
          disabled={disabled || pending}
        >
          {executeLabel}
        </button>
      )}
    </form>
  );
}
