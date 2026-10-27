import { Redirect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/context/session';
import { STEAM_GUARD_CODE_LENGTH, useSteamLogin } from '@/hooks/use-steam-login';

const colors = {
  canvas: '#292C33',
  chrome: '#202126',
  field: '#202126',
  text: '#DDE1E5',
  muted: '#969EA7',
  primary: '#216CAD',
  primaryPressed: '#195E96',
  primaryDisabled: '#2A3E52',
  focusRing: '#4A8EC2',
  error: '#E2807D',
  toast: '#1C1F24',
  toastBorder: '#3A3E45',
} as const;

type FieldName = 'account' | 'password' | 'guard';
type FieldErrors = Partial<Record<FieldName, string>>;

const HELP_URL = 'https://help.steampowered.com/en/';
const CREATE_ACCOUNT_URL = 'https://store.steampowered.com/join/';

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const session = useSession();
  const passwordInputRef = useRef<TextInputInstance>(null);
  const guardInputRef = useRef<TextInputInstance>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [accountName, setAccountName] = useState('');
  const [password, setPassword] = useState('');
  const [guardCode, setGuardCode] = useState('');
  const [focusedField, setFocusedField] = useState<FieldName | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [toast, setToast] = useState<string | null>(null);

  const { state: loginState, signIn, submitGuardCode, useCodeInstead, reset } = useSteamLogin(
    (result) => {
      session.signIn(result);
      router.replace('/friends');
    },
  );

  const isBusy = loginState.phase === 'starting' || loginState.phase === 'finishing';
  const isGuardStep = loginState.phase === 'guard-code';
  const isWaitingStep =
    loginState.phase === 'device-confirmation' || loginState.phase === 'email-confirmation';
  const isFinishingStep = loginState.phase === 'finishing';

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isGuardStep) {
      guardInputRef.current?.focus();
    }
  }, [isGuardStep]);

  const showToast = (message: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(null), 3200);
  };

  const handleAccountChange = (value: string) => {
    setAccountName(value);
    if (errors.account) {
      setErrors((current) => ({ ...current, account: undefined }));
    }
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (errors.password) {
      setErrors((current) => ({ ...current, password: undefined }));
    }
  };

  const handleGuardChange = (value: string) => {
    setGuardCode(value.replace(/[^0-9A-Za-z]/g, '').slice(0, STEAM_GUARD_CODE_LENGTH));
    if (errors.guard) {
      setErrors((current) => ({ ...current, guard: undefined }));
    }
  };

  const handleSubmit = () => {
    Keyboard.dismiss();

    const nextErrors: FieldErrors = {};

    if (!accountName.trim()) {
      nextErrors.account = 'Enter your Steam account name.';
    }

    if (!password) {
      nextErrors.password = 'Enter your password.';
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    void signIn(accountName.trim(), password, true);
  };

  const handleGuardSubmit = () => {
    Keyboard.dismiss();

    if (guardCode.length !== STEAM_GUARD_CODE_LENGTH) {
      setErrors({ guard: `Enter the ${STEAM_GUARD_CODE_LENGTH}-character code.` });
      return;
    }

    setErrors({});
    void submitGuardCode(guardCode);
  };

  const handleCancel = () => {
    Keyboard.dismiss();
    setGuardCode('');
    setErrors({});
    reset();
  };

  const openExternalLink = async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      showToast('Could not open that link. Please try again.');
    }
  };

  if (session.status === 'loading') {
    return (
      <View style={styles.loadingRoot}>
        <StatusBar style="light" />
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (session.status === 'signed-in') {
    return <Redirect href="/friends" />;
  }

  const guardLabel =
    loginState.guardKind === 'email' ? 'STEAM GUARD EMAIL CODE' : 'STEAM GUARD CODE';
  const agreementUrl = loginState.phase === 'error' ? loginState.agreementUrl : undefined;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={[styles.chrome, { height: insets.top }]} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.canvas}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 48 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.column}>
            <Text accessibilityRole="header" style={styles.title}>
              {isGuardStep || isWaitingStep ? 'STEAM GUARD' : 'SIGN IN'}
            </Text>

            {isGuardStep ? (
              <View style={styles.form}>
                <Text style={styles.subtitle}>
                  {loginState.guardKind === 'email'
                    ? `Enter the code Steam emailed to the address on ${accountName.trim() || 'your account'}.`
                    : 'Enter the code from your Steam Guard authenticator.'}
                </Text>

                <View style={styles.passwordGroup}>
                  <Text style={styles.label}>{guardLabel}</Text>
                  <TextInput
                    ref={guardInputRef}
                    accessibilityHint={`Enter the ${STEAM_GUARD_CODE_LENGTH}-character Steam Guard code`}
                    accessibilityLabel="Steam Guard code"
                    autoCapitalize="characters"
                    autoComplete="one-time-code"
                    autoCorrect={false}
                    maxLength={STEAM_GUARD_CODE_LENGTH}
                    onBlur={() =>
                      setFocusedField((current) => (current === 'guard' ? null : current))
                    }
                    onChangeText={handleGuardChange}
                    onFocus={() => setFocusedField('guard')}
                    onSubmitEditing={handleGuardSubmit}
                    returnKeyType="go"
                    selectionColor={colors.focusRing}
                    style={[
                      styles.input,
                      styles.guardInput,
                      focusedField === 'guard' && styles.inputFocused,
                      errors.guard && styles.inputError,
                    ]}
                    textContentType="oneTimeCode"
                    underlineColorAndroid="transparent"
                    value={guardCode}
                  />
                  {errors.guard ? (
                    <Text accessibilityRole="alert" style={styles.errorText}>
                      {errors.guard}
                    </Text>
                  ) : null}
                  {loginState.error ? (
                    <Text accessibilityRole="alert" style={styles.errorText}>
                      {loginState.error}
                    </Text>
                  ) : null}
                </View>

                <Pressable
                  accessibilityLabel="Submit Steam Guard code"
                  accessibilityRole="button"
                  disabled={isBusy}
                  onPress={handleGuardSubmit}
                  style={({ pressed }) => [
                    styles.button,
                    pressed && styles.buttonPressed,
                    isBusy && styles.buttonDisabled,
                  ]}>
                  {isBusy ? (
                    <ActivityIndicator color={colors.text} />
                  ) : (
                    <Text style={styles.buttonText}>Verify</Text>
                  )}
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  disabled={isBusy}
                  onPress={handleCancel}
                  style={styles.helpButton}>
                  <Text style={styles.helpText}>Use a different account</Text>
                </Pressable>
              </View>
            ) : isWaitingStep ? (
              <View style={styles.form}>
                <ActivityIndicator color={colors.primary} size="large" style={styles.spinner} />

                <Text style={styles.subtitle}>
                  {loginState.phase === 'device-confirmation'
                    ? 'Open the Steam mobile app and approve this sign-in.'
                    : 'Approve the sign-in from the email Steam just sent you.'}
                </Text>

                {loginState.confirmationMessage ? (
                  <Text style={styles.confirmation}>{loginState.confirmationMessage}</Text>
                ) : null}

                {loginState.guardKind ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={useCodeInstead}
                    style={styles.helpButton}>
                    <Text style={styles.helpText}>Use a code instead</Text>
                  </Pressable>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  onPress={handleCancel}
                  style={styles.helpButton}>
                  <Text style={styles.helpText}>Cancel</Text>
                </Pressable>
              </View>
            ) : isFinishingStep ? (
              <View style={styles.form}>
                <ActivityIndicator color={colors.primary} size="large" style={styles.spinner} />
                <Text style={styles.subtitle}>Signing you in…</Text>

                <Pressable
                  accessibilityRole="button"
                  onPress={handleCancel}
                  style={styles.helpButton}>
                  <Text style={styles.helpText}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.form}>
                <View>
                  <Text style={styles.label}>STEAM ACCOUNT NAME</Text>
                  <TextInput
                    accessibilityHint="Enter the account name for your Steam account"
                    accessibilityLabel="Steam account name"
                    autoCapitalize="none"
                    autoComplete="username"
                    autoCorrect={false}
                    editable={!isBusy}
                    importantForAutofill="yes"
                    maxLength={64}
                    onBlur={() =>
                      setFocusedField((current) => (current === 'account' ? null : current))
                    }
                    onChangeText={handleAccountChange}
                    onFocus={() => setFocusedField('account')}
                    onSubmitEditing={() => passwordInputRef.current?.focus()}
                    returnKeyType="next"
                    selectionColor={colors.focusRing}
                    style={[
                      styles.input,
                      focusedField === 'account' && styles.inputFocused,
                      errors.account && styles.inputError,
                    ]}
                    textContentType="username"
                    underlineColorAndroid="transparent"
                    value={accountName}
                  />
                  {errors.account ? (
                    <Text accessibilityRole="alert" style={styles.errorText}>
                      {errors.account}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.passwordGroup}>
                  <Text style={styles.label}>PASSWORD</Text>
                  <View>
                    <TextInput
                      ref={passwordInputRef}
                      accessibilityHint="Enter the password for your Steam account"
                      accessibilityLabel="Password"
                      autoCapitalize="none"
                      autoComplete="current-password"
                      autoCorrect={false}
                      editable={!isBusy}
                      importantForAutofill="yes"
                      maxLength={64}
                      onBlur={() =>
                        setFocusedField((current) => (current === 'password' ? null : current))
                      }
                      onChangeText={handlePasswordChange}
                      onFocus={() => setFocusedField('password')}
                      onSubmitEditing={handleSubmit}
                      returnKeyType="go"
                      secureTextEntry={!passwordVisible}
                      selectionColor={colors.focusRing}
                      style={[
                        styles.input,
                        password.length > 0 && styles.inputWithAction,
                        focusedField === 'password' && styles.inputFocused,
                        errors.password && styles.inputError,
                      ]}
                      textContentType="password"
                      underlineColorAndroid="transparent"
                      value={password}
                    />

                    {password.length > 0 ? (
                      <Pressable
                        accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
                        accessibilityRole="button"
                        hitSlop={8}
                        onPress={() => setPasswordVisible((current) => !current)}
                        style={styles.passwordAction}>
                        <Text style={styles.passwordActionText}>
                          {passwordVisible ? 'HIDE' : 'SHOW'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {errors.password ? (
                    <Text accessibilityRole="alert" style={styles.errorText}>
                      {errors.password}
                    </Text>
                  ) : null}
                </View>

                <Pressable
                  accessibilityLabel="Sign in"
                  accessibilityRole="button"
                  disabled={isBusy}
                  onPress={handleSubmit}
                  style={({ pressed }) => [
                    styles.button,
                    pressed && styles.buttonPressed,
                    isBusy && styles.buttonDisabled,
                  ]}>
                  {isBusy ? (
                    <ActivityIndicator color={colors.text} />
                  ) : (
                    <Text style={styles.buttonText}>Sign in</Text>
                  )}
                </Pressable>

                {loginState.phase === 'error' && loginState.error ? (
                  <Text accessibilityRole="alert" style={[styles.errorText, styles.formError]}>
                    {loginState.error}
                  </Text>
                ) : null}

                {agreementUrl ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => void openExternalLink(agreementUrl)}
                    style={styles.helpButton}>
                    <Text style={styles.helpText}>Review the Steam Subscriber Agreement</Text>
                  </Pressable>
                ) : null}

                <Pressable
                  accessibilityRole="link"
                  onPress={() => openExternalLink(HELP_URL)}
                  style={styles.helpButton}>
                  <Text style={styles.helpText}>I need help signing in</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="link"
                  onPress={() => openExternalLink(CREATE_ACCOUNT_URL)}
                  style={styles.createButton}>
                  <Text style={styles.createText}>Create a new account</Text>
                </Pressable>
              </View>
            )}
          </View>
        </ScrollView>

        {toast ? (
          <View pointerEvents="none" style={styles.toastContainer}>
            <View
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
              style={styles.toast}>
              <Text style={styles.toastText}>{toast}</Text>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <View style={[styles.chrome, { height: insets.bottom }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.chrome,
  },
  loadingRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
  },
  chrome: {
    backgroundColor: colors.chrome,
  },
  canvas: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  column: {
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '300',
    letterSpacing: 3.6,
    lineHeight: 40,
    textAlign: 'center',
    includeFontPadding: false,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14.5,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 8,
  },
  confirmation: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 10,
  },
  spinner: {
    marginBottom: 18,
  },
  form: {
    marginTop: 45,
  },
  formError: {
    marginTop: 14,
    textAlign: 'center',
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '400',
    letterSpacing: 1.1,
    lineHeight: 18,
    marginBottom: 10,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 4,
    backgroundColor: colors.field,
    color: colors.text,
    fontSize: 16,
    lineHeight: 20,
    outlineWidth: 0,
    paddingHorizontal: 16,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  guardInput: {
    fontSize: 22,
    letterSpacing: 8,
    textAlign: 'center',
  },
  inputFocused: {
    borderColor: colors.focusRing,
  },
  inputError: {
    borderColor: colors.error,
  },
  inputWithAction: {
    paddingRight: 64,
  },
  passwordGroup: {
    marginTop: 20,
  },
  passwordAction: {
    position: 'absolute',
    top: 0,
    right: 0,
    height: 52,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passwordActionText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  button: {
    height: 54,
    marginTop: 18,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  buttonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  buttonDisabled: {
    backgroundColor: colors.primaryDisabled,
  },
  buttonText: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  helpButton: {
    alignSelf: 'center',
    marginTop: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  helpText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textDecorationLine: 'underline',
  },
  createButton: {
    alignSelf: 'center',
    marginTop: 36,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  createText: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 28,
    textDecorationLine: 'underline',
  },
  toastContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 16,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  toast: {
    width: '100%',
    maxWidth: 430,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.toastBorder,
    backgroundColor: colors.toast,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  toastText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
