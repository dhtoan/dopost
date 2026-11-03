package platform

// AccountContentOrigin identifies where analytics content was published.
// dopost only tracks content published through dopost; there is no
// inventory for content published elsewhere.
type AccountContentOrigin string

const (
	AccountContentOriginOpenPost AccountContentOrigin = "openpost"
)

const (
	AccountContentMaxTextCharacters  = 10_000
	AccountContentMaxTitleCharacters = 500
)
