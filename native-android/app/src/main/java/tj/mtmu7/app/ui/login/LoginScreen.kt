package tj.mtmu7.app.ui.login

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import tj.mtmu7.app.BuildConfig
import tj.mtmu7.app.R
import tj.mtmu7.app.Services
import tj.mtmu7.app.ui.common.errorText
import tj.mtmu7.shared.auth.SignIn

/**
 * Signing in: the login the school issued (MT10001), a nickname or an address,
 * and the password; then the six-digit code when the account has a second step.
 */
@Composable
fun LoginScreen(services: Services?, onSignedIn: () -> Unit) {
    var login by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var code by rememberSaveable { mutableStateOf("") }
    var needsCode by rememberSaveable { mutableStateOf(false) }
    var showPassword by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val uri = LocalUriHandler.current

    fun handle(result: SignIn) {
        when (result) {
            is SignIn.Done -> onSignedIn()
            SignIn.NeedsCode -> {
                needsCode = true
                error = null
            }
            is SignIn.Failed -> error = result.error
        }
    }

    fun submit() {
        val s = services ?: return
        if (busy) return
        busy = true
        error = null
        scope.launch {
            handle(if (needsCode) s.auth.verifyCode(code) else s.auth.signIn(login, password))
            busy = false
        }
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding(),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier
                .widthIn(max = 440.dp)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Image(
                painterResource(R.mipmap.ic_launcher_foreground),
                contentDescription = null,
                modifier = Modifier.size(96.dp).clip(RoundedCornerShape(24.dp)),
            )
            Text(stringResource(R.string.app_name), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 8.dp))
            Text(stringResource(R.string.school_subtitle), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(28.dp))
            Surface(shape = RoundedCornerShape(22.dp), tonalElevation = 1.dp, shadowElevation = 2.dp, color = MaterialTheme.colorScheme.surface) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text(
                        stringResource(if (needsCode) R.string.code_title else R.string.sign_in_title),
                        style = MaterialTheme.typography.titleLarge,
                    )
                    Text(
                        stringResource(if (needsCode) R.string.code_lead else R.string.sign_in_lead),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (!needsCode) {
                        OutlinedTextField(
                            value = login,
                            onValueChange = { login = it.take(254) },
                            label = { Text(stringResource(R.string.login)) },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                            modifier = Modifier.fillMaxWidth(),
                        )
                        OutlinedTextField(
                            value = password,
                            onValueChange = { password = it.take(128) },
                            label = { Text(stringResource(R.string.password)) },
                            singleLine = true,
                            visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go),
                            keyboardActions = KeyboardActions(onGo = { submit() }),
                            trailingIcon = {
                                IconButton(onClick = { showPassword = !showPassword }) {
                                    Icon(
                                        if (showPassword) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                                        contentDescription = stringResource(R.string.show_password),
                                    )
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                        )
                    } else {
                        OutlinedTextField(
                            value = code,
                            onValueChange = { v -> code = v.filter { it.isDigit() }.take(6) },
                            label = { Text(stringResource(R.string.code)) },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Go),
                            keyboardActions = KeyboardActions(onGo = { submit() }),
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    if (error != null) {
                        Text(errorText(error), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
                    }
                    Button(
                        onClick = { submit() },
                        enabled = services != null && !busy && (if (needsCode) code.length == 6 else login.isNotBlank() && password.isNotEmpty()),
                        modifier = Modifier.fillMaxWidth().height(50.dp),
                        shape = RoundedCornerShape(14.dp),
                    ) {
                        if (busy || services == null) {
                            CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.5.dp, color = MaterialTheme.colorScheme.onPrimary)
                        } else {
                            Text(stringResource(if (needsCode) R.string.confirm else R.string.sign_in))
                        }
                    }
                    if (needsCode) {
                        TextButton(onClick = {
                            needsCode = false
                            code = ""
                            scope.launch { services?.auth?.signOut() }
                        }) { Text(stringResource(R.string.back)) }
                    } else {
                        TextButton(onClick = { uri.openUri(BuildConfig.PORTAL_URL + "/forgot-password") }, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                            Text(stringResource(R.string.forgot_password))
                        }
                    }
                }
            }
            if (services == null) {
                Text(
                    stringResource(R.string.connecting),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 16.dp),
                )
            }
        }
    }
}
