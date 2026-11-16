"use client";

import { useActionState } from "react";
import { ArrowRight } from "lucide-react";
import { requestMagicLink, type LoginState } from "./actions";

const initialState: LoginState = {};

type LoginFormProps = {
  labels: {
    sendLink: string;
    sending: string;
    workEmail: string;
  };
};

export function LoginForm({ labels }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(requestMagicLink, initialState);

  return (
    <form action={formAction} className="login-form">
      <label htmlFor="email">{labels.workEmail}</label>
      <input
        autoComplete="email"
        id="email"
        name="email"
        placeholder="you@atlas.mn"
        required
        type="email"
      />
      <button disabled={pending} type="submit">
        {pending ? labels.sending : labels.sendLink}
        <ArrowRight aria-hidden="true" size={17} />
      </button>
      {state.error && <p className="login-form__message login-form__message--error">{state.error}</p>}
      {state.success && <p className="login-form__message">{state.success}</p>}
    </form>
  );
}
