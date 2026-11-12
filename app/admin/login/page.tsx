import { loginAction } from "../actions";

export const metadata = { title: "Lead Router · Sign in" };

export default async function Login(props: { searchParams: Promise<{ error?: string }> }) {
  const searchParams = await props.searchParams;
  return (
    <main className="wrap narrow">
      <p className="kicker">Lead Router</p>
      <h1>Sign in</h1>
      {searchParams.error ? <p className="notice">That password didn't match. Try again.</p> : null}
      <form action={loginAction} className="stack card">
        <label>
          Admin password
          <input id="password" name="password" type="password" required autoComplete="current-password" />
        </label>
        <div>
          <button type="submit">Sign in</button>
        </div>
      </form>
    </main>
  );
}
