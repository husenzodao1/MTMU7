package tj.mtmu7.shared.core

/**
 * Text as a search compares it: lower case, and each Tajik letter folded into
 * the one a Russian keyboard types for it (ҳ→х, қ→к, ҷ→ч, ӣ→и, ӯ→у, ғ→г, ё→е),
 * so "Мехровар" finds "Меҳровар". The same folding as the site
 * (src/lib/search/fold.ts) and the database (app.fold, 00095).
 */
fun fold(text: String): String {
    val lower = text.lowercase()
    val out = StringBuilder(lower.length)
    for (c in lower) {
        out.append(
            when (c) {
                'ҳ' -> 'х'
                'қ' -> 'к'
                'ҷ' -> 'ч'
                'ӣ' -> 'и'
                'ӯ' -> 'у'
                'ғ' -> 'г'
                'ё' -> 'е'
                else -> c
            }
        )
    }
    return out.toString()
}
