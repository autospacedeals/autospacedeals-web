// Submit a <form> through its useActionState action by hand instead of
// letting <form action> do it. React resets a form after every action —
// including one that returns an error — so a typo in one field would wipe
// everything else the person typed. Use as:
//   <form action={formAction} onSubmit={submitKeepingValues(formAction)}>
// Keep the action prop too: without JS (or before hydration) the form still
// posts to the same action natively. A form that should clear after a
// successful save can still do it by changing its `key`.
import { startTransition, type FormEvent } from "react";

export function submitKeepingValues(action: (formData: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const formData = new FormData(e.currentTarget, submitter);
    startTransition(() => action(formData));
  };
}
