package tj.mtmu7.app.ui.messages

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.HeadsetMic
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import tj.mtmu7.app.R
import tj.mtmu7.app.Services
import tj.mtmu7.app.ui.common.Avatar
import tj.mtmu7.app.ui.common.errorText
import tj.mtmu7.shared.model.ContactRow

/** Whom one may write to (search_message_contacts: Ҳ and Х, Қ and К alike), and the support desk. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewChatScreen(services: Services, onBack: () -> Unit, onOpen: (String) -> Unit) {
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<ContactRow>>(emptyList()) }
    var searching by remember { mutableStateOf(false) }
    var opening by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val focus = remember { FocusRequester() }

    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    LaunchedEffect(query) {
        if (query.trim().length < 2) {
            results = emptyList()
            return@LaunchedEffect
        }
        delay(300)
        searching = true
        results = services.messenger.searchContacts(query)
        searching = false
    }

    fun open(block: suspend () -> String?) {
        if (opening) return
        opening = true
        error = null
        scope.launch {
            val id = block()
            opening = false
            if (id != null) onOpen(id) else error = "errors.unexpected"
        }
    }

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        TopAppBar(
            title = { Text(stringResource(R.string.new_chat)) },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.back)) } },
        )
        OutlinedTextField(
            value = query,
            onValueChange = { query = it.take(60) },
            label = { Text(stringResource(R.string.search_people)) },
            supportingText = { Text(stringResource(R.string.search_people_hint)) },
            singleLine = true,
            trailingIcon = { if (searching || opening) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).focusRequester(focus),
        )
        if (error != null) Text(errorText(error), color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp))
        LazyColumn(Modifier.fillMaxSize()) {
            if (query.isBlank()) {
                item {
                    Row(
                        Modifier.fillMaxWidth().clickable { open { services.messenger.openSupport() } }.padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(Modifier.size(44.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
                            Icon(Icons.Outlined.HeadsetMic, null, tint = MaterialTheme.colorScheme.onPrimaryContainer)
                        }
                        Spacer(Modifier.width(12.dp))
                        Text(stringResource(R.string.support_chat), style = MaterialTheme.typography.titleMedium)
                    }
                }
            }
            if (query.trim().length >= 2 && !searching && results.isEmpty()) {
                item { Text(stringResource(R.string.nobody_found), color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(16.dp)) }
            }
            items(results, key = { it.id }) { person ->
                val name = listOfNotNull(person.lastName, person.firstName).joinToString(" ")
                Row(
                    Modifier.fillMaxWidth().clickable { open { services.messenger.openDirect(person.id) } }.padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Avatar(name, person.avatarUrl)
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(name, style = MaterialTheme.typography.titleMedium)
                        person.nickname?.let { Text("@$it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                }
            }
        }
    }
}
