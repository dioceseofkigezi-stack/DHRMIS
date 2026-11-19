import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { supabase } from "@/core/config";
import { useNetworkStatus } from "@/core/monitoring/useNetworkStatus";
import { useAuth } from "@/modules/core/auth/context";

interface ProfileDetails {
  fullName: string;
  phone: string;
}

const photoMimeTypes = ["image/jpeg", "image/png", "image/webp"];
const photoSizeLimit = 3 * 1024 * 1024;

async function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "context" in error && error.context instanceof Response) {
    try {
      const body = await error.context.clone().json() as { message?: unknown };
      if (typeof body.message === "string") return body.message;
    } catch {
      // Use the provider's message below when the response has no JSON body.
    }
  }
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return error instanceof Error && error.message ? error.message : fallback;
}

function userText(value: unknown) {
  return typeof value === "string" ? value : "";
}

export default function ProfileSettingsPage({ avatarUrl }: { avatarUrl: string }) {
  const { session } = useAuth();
  const online = useNetworkStatus();
  const user = session?.user;
  const [details, setDetails] = useState<ProfileDetails>(() => ({
    fullName: userText(user?.user_metadata?.full_name || user?.user_metadata?.name),
    phone: userText(user?.user_metadata?.phone || user?.user_metadata?.telephone),
  }));
  const [email, setEmail] = useState(user?.email ?? "");
  const [profileBusy, setProfileBusy] = useState(false);
  const [usernameLoading, setUsernameLoading] = useState(true);
  const [usernameBusy, setUsernameBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [savedUsername, setSavedUsername] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState(false);
  const [usernameError, setUsernameError] = useState("");
  const [usernameMessage, setUsernameMessage] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [photoMessage, setPhotoMessage] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("");
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState("");
  const metadataAvatarPath = userText(user?.user_metadata?.avatar_path);

  useEffect(() => {
    if (!supabase || !user) {
      setUsernameLoading(false);
      return;
    }
    let active = true;
    setDetails({
      fullName: userText(user.user_metadata?.full_name || user.user_metadata?.name),
      phone: userText(user.user_metadata?.phone || user.user_metadata?.telephone),
    });
    setEmail(user.email ?? "");
    setUsernameLoading(true);
    setUsernameError("");

    async function loadUsername() {
      const { data, error } = await supabase!.rpc("get_my_username");
      if (!active) return;
      if (error) {
        setUsernameAvailable(false);
        setUsernameError(error.code === "PGRST202" || error.code === "42883"
          ? "Username settings need the latest database migration. Your name and phone can still be updated."
          : await errorMessage(error, "Your username could not be loaded."));
      } else {
        const value = userText(data);
        setUsername(value);
        setSavedUsername(value);
        setUsernameAvailable(true);
      }
      setUsernameLoading(false);
    }

    void loadUsername().catch(async (reason: unknown) => {
      if (!active) return;
      setUsernameAvailable(false);
      setUsernameError(await errorMessage(reason, "Your username could not be loaded."));
      setUsernameLoading(false);
    });
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => () => {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
  }, [photoPreviewUrl]);

  useEffect(() => {
    if (avatarUrl) setUploadedPhotoUrl("");
  }, [avatarUrl]);

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !online) return;
    const fullName = details.fullName.trim();
    const phone = details.phone.trim();
    const phoneDigits = phone.replace(/\D/g, "");
    if (!fullName || fullName.length > 120) {
      setProfileError("Enter a name of 1 to 120 characters.");
      return;
    }
    if (phone && (!/^[+0-9().\s-]+$/.test(phone) || phoneDigits.length < 7 || phoneDigits.length > 15)) {
      setProfileError("Enter a valid phone number with 7 to 15 digits.");
      return;
    }
    setProfileBusy(true);
    setProfileError("");
    setProfileMessage("");
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: fullName,
          name: fullName,
          phone: phone || null,
          telephone: null,
        },
      });
      if (error) throw error;
      setProfileMessage("Your account details have been saved.");
    } catch (reason) {
      setProfileError(await errorMessage(reason, "Your account details could not be saved."));
    } finally {
      setProfileBusy(false);
    }
  }

  async function saveUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !online || !usernameAvailable) return;
    setUsernameBusy(true);
    setUsernameError("");
    setUsernameMessage("");
    try {
      const { data, error } = await supabase.rpc("set_my_username", {
        p_username: username.trim() || null,
      });
      if (error) throw error;
      const updatedUsername = userText(data);
      setUsername(updatedUsername);
      setSavedUsername(updatedUsername);
      setUsernameMessage("Your username has been saved.");
    } catch (reason) {
      setUsernameError(await errorMessage(reason, "Your username could not be saved."));
    } finally {
      setUsernameBusy(false);
    }
  }

  async function saveEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !online || !user) return;
    const nextEmail = email.trim().toLowerCase();
    if (nextEmail === (user.email ?? "").toLowerCase()) {
      setEmailMessage("This is already your current email address.");
      setEmailError("");
      return;
    }
    setEmailBusy(true);
    setEmailError("");
    setEmailMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("self-service-email", {
        body: { email: nextEmail },
      });
      if (error) throw new Error(await errorMessage(error, "Your email address could not be changed."));
      if (!data || typeof data.email !== "string") throw new Error("Your email address could not be changed.");
      setEmail(data.email);
      setEmailMessage("Your email address has been updated.");
      try {
        await supabase.auth.refreshSession();
      } catch {
        // The email change has already succeeded; the next sign-in will load the updated address.
      }
    } catch (reason) {
      setEmailError(await errorMessage(reason, "Your email address could not be changed."));
    } finally {
      setEmailBusy(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !online || !user?.email) return;
    setPasswordError("");
    setPasswordMessage("");
    if (newPassword.length < 8) {
      setPasswordError("Use at least 8 characters for your new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("The new passwords do not match.");
      return;
    }
    setPasswordBusy(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signInError) throw new Error("Your current password is incorrect.");
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Your password has been changed.");
    } catch (reason) {
      setPasswordError(await errorMessage(reason, "Your password could not be changed."));
    } finally {
      setPasswordBusy(false);
    }
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    setPhotoError("");
    setPhotoMessage("");
    if (!file) return;
    setSelectedPhoto(null);
    setPhotoPreviewUrl("");
    if (!photoMimeTypes.includes(file.type)) {
      setPhotoError("Choose a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > photoSizeLimit) {
      setPhotoError("Choose an image smaller than 3 MB.");
      return;
    }
    setSelectedPhoto(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  }

  async function uploadPhoto() {
    if (!supabase || !online || !user || !selectedPhoto) return;
    setPhotoBusy(true);
    setPhotoError("");
    setPhotoMessage("");
    const previousPath = metadataAvatarPath;
    const path = `${user.id}/${crypto.randomUUID()}`;
    try {
      const { error: uploadError } = await supabase.storage.from("profile-photos").upload(path, selectedPhoto, {
        upsert: true,
        contentType: selectedPhoto.type,
        cacheControl: "3600",
      });
      if (uploadError) throw uploadError;
      const { error: metadataError } = await supabase.auth.updateUser({ data: { avatar_path: path } });
      if (metadataError) throw metadataError;
      const { data, error: urlError } = await supabase.storage.from("profile-photos").createSignedUrl(path, 60 * 60);
      if (!urlError) setUploadedPhotoUrl(data.signedUrl);
      if (previousPath && previousPath !== path) {
        const { error: cleanupError } = await supabase.storage.from("profile-photos").remove([previousPath]);
        setPhotoMessage(cleanupError
          ? "Your new profile picture is saved. The previous image could not be removed."
          : "Your profile picture has been updated.");
      } else {
        setPhotoMessage("Your profile picture has been updated.");
      }
      setSelectedPhoto(null);
      setPhotoPreviewUrl("");
    } catch (reason) {
      setPhotoError(await errorMessage(reason, "Your profile picture could not be saved."));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    if (!supabase || !online || !user || !metadataAvatarPath) return;
    setPhotoBusy(true);
    setPhotoError("");
    setPhotoMessage("");
    try {
      const { error: metadataError } = await supabase.auth.updateUser({ data: { avatar_path: null } });
      if (metadataError) throw metadataError;
      setUploadedPhotoUrl("");
      const { error } = await supabase.storage.from("profile-photos").remove([metadataAvatarPath]);
      if (error) setPhotoMessage("Your profile picture was removed. Its stored image could not be deleted.");
      else setPhotoMessage("Your profile picture has been removed.");
    } catch (reason) {
      setPhotoError(await errorMessage(reason, "Your profile picture could not be removed."));
    } finally {
      setPhotoBusy(false);
    }
  }

  const displayedAvatar = photoPreviewUrl || uploadedPhotoUrl || avatarUrl;

  return (
    <div className="page-content profile-settings-page">
      <div className="page-heading">
        <div><p className="eyebrow">YOUR ACCOUNT</p><h1>Account settings</h1></div>
      </div>

      <section className="panel profile-photo-panel" aria-labelledby="profile-photo-title">
        <div className="profile-photo-avatar" role="img" aria-label="Profile picture">
          {displayedAvatar ? <img src={displayedAvatar} alt="" /> : <span>{userText(details.fullName || user?.email).slice(0, 1).toUpperCase() || "A"}</span>}
        </div>
        <div className="profile-photo-copy">
          <p className="eyebrow">PROFILE PHOTO</p>
          <h2 id="profile-photo-title">{details.fullName || "Your profile"}</h2>
          {photoError && <div className="notice notice-error" role="alert">{photoError}</div>}
          {photoMessage && <div className="notice notice-success" role="status">{photoMessage}</div>}
          <div className="profile-photo-actions">
            <label className="button button-secondary profile-photo-choose">
              <Icon name="upload" size={15} /> Choose picture
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} disabled={photoBusy || !online} />
            </label>
            {selectedPhoto && <button className="button button-primary" type="button" onClick={() => void uploadPhoto()} disabled={photoBusy || !online}>
              {photoBusy ? "Saving…" : "Save picture"}
            </button>}
            {metadataAvatarPath && !selectedPhoto && <button className="text-button profile-photo-remove" type="button" onClick={() => void removePhoto()} disabled={photoBusy || !online}>Remove picture</button>}
          </div>
        </div>
      </section>

      <div className="profile-settings-grid">
        <div className="profile-settings-personal">
          <form className="panel profile-settings-card" onSubmit={(event) => void saveDetails(event)}>
            <div className="profile-settings-card-heading"><span className="profile-settings-icon"><Icon name="people" size={17} /></span><div><h2>Personal details</h2></div></div>
            {profileError && <div className="notice notice-error" role="alert">{profileError}</div>}
            {profileMessage && <div className="notice notice-success" role="status">{profileMessage}</div>}
            <label className="field">Full name
              <input type="text" autoComplete="name" maxLength={120} required value={details.fullName} onChange={(event) => setDetails((current) => ({ ...current, fullName: event.target.value }))} />
            </label>
            <label className="field">Phone number
              <input type="tel" autoComplete="tel" maxLength={30} value={details.phone} onChange={(event) => setDetails((current) => ({ ...current, phone: event.target.value }))} />
            </label>
            <div className="profile-settings-actions"><button className="button button-primary" type="submit" disabled={profileBusy || !online}>{profileBusy ? "Saving…" : "Save details"}</button></div>
          </form>

          <form className="panel profile-settings-card" onSubmit={(event) => void saveUsername(event)}>
            <div className="profile-settings-card-heading"><span className="profile-settings-icon"><Icon name="role" size={17} /></span><div><h2>Username</h2></div></div>
            {usernameError && <div className="notice notice-error" role="alert">{usernameError}</div>}
            {usernameMessage && <div className="notice notice-success" role="status">{usernameMessage}</div>}
            <label className="field">Username
              <input type="text" autoComplete="username" maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,39}" value={username} onChange={(event) => setUsername(event.target.value)} disabled={!usernameAvailable || usernameBusy} />
              <small className="field-help">Optional and unique. Use 3–40 letters, numbers, dots, underscores or hyphens.</small>
            </label>
            <div className="profile-settings-actions"><button className="button button-primary" type="submit" disabled={!usernameAvailable || usernameLoading || usernameBusy || username === savedUsername || !online}>{usernameBusy ? "Saving…" : usernameLoading ? "Loading…" : "Save username"}</button></div>
          </form>
        </div>

        <div className="profile-settings-security">
          <form className="panel profile-settings-card" onSubmit={(event) => void saveEmail(event)}>
            <div className="profile-settings-card-heading"><span className="profile-settings-icon"><Icon name="assignment" size={17} /></span><div><h2>Email address</h2></div></div>
            {emailError && <div className="notice notice-error" role="alert">{emailError}</div>}
            {emailMessage && <div className="notice notice-success" role="status">{emailMessage}</div>}
            <label className="field">Email
              <input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <div className="profile-settings-actions"><button className="button button-primary" type="submit" disabled={emailBusy || !online}>{emailBusy ? "Updating…" : "Update email"}</button></div>
          </form>

          <form className="panel profile-settings-card" onSubmit={(event) => void changePassword(event)}>
            <div className="profile-settings-card-heading"><span className="profile-settings-icon"><Icon name="security" size={17} /></span><div><h2>Change password</h2></div></div>
            {passwordError && <div className="notice notice-error" role="alert">{passwordError}</div>}
            {passwordMessage && <div className="notice notice-success" role="status">{passwordMessage}</div>}
            <label className="field">Current password
              <input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
            </label>
            <label className="field">New password
              <input type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
            </label>
            <label className="field">Confirm new password
              <input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            </label>
            <div className="profile-settings-actions"><button className="button button-primary" type="submit" disabled={passwordBusy || !online}>{passwordBusy ? "Updating…" : "Change password"}</button></div>
          </form>
        </div>
      </div>
    </div>
  );
}
