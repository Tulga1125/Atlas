"use client";

import { useActionState, useState } from "react";
import { ArrowRight } from "lucide-react";
import { requestMagicLink, type LoginState } from "./actions";

const initialState: LoginState = {};

type LoginFormProps = {
  labels: {
    sendLink: string;
    sending: string;
    workEmail: string;
    accessCode: string;
    signIn: string;
  };
};

export function LoginForm({ labels }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(requestMagicLink, initialState);
  // Typing "admin" asks for the access code instead of sending an email link.
  const [email, setEmail] = useState("");
  const adminCode = email.trim().toLowerCase() === "admin";

  return (
    <form action={formAction} className="login-form">
      <label htmlFor="email">{labels.workEmail}</label>
      <input
        autoCapitalize="none"
        autoComplete="username"
        id="email"
        inputMode="email"
        name="email"
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@atlas.mn"
        required
        spellCheck={false}
        type="text"
        value={email}
      />
      {adminCode && (
        <>
          <label htmlFor="code">{labels.accessCode}</label>
          <input autoComplete="current-password" autoFocus id="code" name="code" required type="password" />
        </>
      )}
      <button disabled={pending} type="submit">
        {pending ? labels.sending : adminCode ? labels.signIn : labels.sendLink}
        <ArrowRight aria-hidden="true" size={17} />
      </button>
      {state.error && <p className="login-form__message login-form__message--error">{state.error}</p>}
      {state.success && <p className="login-form__message">{state.success}</p>}
    </form>
  );
}
