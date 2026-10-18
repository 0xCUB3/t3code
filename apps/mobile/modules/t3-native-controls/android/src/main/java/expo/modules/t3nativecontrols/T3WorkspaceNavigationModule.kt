package expo.modules.t3nativecontrols

import android.content.Context
import android.view.ViewGroup
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalWideNavigationRail
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.WideNavigationRailDefaults
import androidx.compose.material3.WideNavigationRailItem
import androidx.compose.material3.WideNavigationRailItemDefaults
import androidx.compose.material3.WideNavigationRailState
import androidx.compose.material3.WideNavigationRailValue
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.rememberWideNavigationRailState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

private val TABS = listOf("threads", "pullRequests", "settings")

class T3WorkspaceNavigationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("T3WorkspaceNavigation")
    View(T3WorkspaceNavigationView::class) {
      Prop("selectedTab") { view: T3WorkspaceNavigationView, value: String ->
        view.selectedTab = value
      }
      Prop("rail") { view: T3WorkspaceNavigationView, value: Boolean -> view.rail = value }
      Prop("dark") { view: T3WorkspaceNavigationView, value: Boolean -> view.dark = value }
      Prop("textScale") { view: T3WorkspaceNavigationView, value: Float -> view.textScale = value }
      Prop("newEnabled") { view: T3WorkspaceNavigationView, value: Boolean ->
        view.newEnabled = value
      }
      Prop("safeAreaTop") { view: T3WorkspaceNavigationView, value: Float ->
        view.safeAreaTop = value
      }
      Prop("headerHeight") { view: T3WorkspaceNavigationView, value: Float ->
        view.headerHeight = value
      }
      Prop("containerColor") { view: T3WorkspaceNavigationView, value: Int ->
        view.containerColor = value
      }
      Prop("selectedColor") { view: T3WorkspaceNavigationView, value: Int ->
        view.selectedColor = value
      }
      Prop("indicatorColor") { view: T3WorkspaceNavigationView, value: Int ->
        view.indicatorColor = value
      }
      Prop("unselectedColor") { view: T3WorkspaceNavigationView, value: Int ->
        view.unselectedColor = value
      }
      Prop("actionColor") { view: T3WorkspaceNavigationView, value: Int ->
        view.actionColor = value
      }
      Prop("actionContentColor") { view: T3WorkspaceNavigationView, value: Int ->
        view.actionContentColor = value
      }
      Events("onTabSelected", "onNewThread")
    }
  }
}

/** One Material3 selection surface moves from below the list to its leading edge. */
@OptIn(ExperimentalMaterial3ExpressiveApi::class)
class T3WorkspaceNavigationView(
  context: Context,
  appContext: AppContext
) : ExpoView(context, appContext) {
  // Compose must remeasure native children when Yoga resizes the folded window.
  override val shouldUseAndroidLayout = true

  private val onTabSelected by EventDispatcher()
  private val onNewThread by EventDispatcher()
  var selectedTab by mutableStateOf("threads")
  var rail by mutableStateOf(false)
  var dark by mutableStateOf(false)
  var textScale by mutableStateOf(1f)
  var newEnabled by mutableStateOf(false)
  var safeAreaTop by mutableStateOf(0f)
  var headerHeight by mutableStateOf(56f)
  var containerColor by mutableStateOf(0)
  var selectedColor by mutableStateOf(0)
  var indicatorColor by mutableStateOf(0)
  var unselectedColor by mutableStateOf(0)
  var actionColor by mutableStateOf(0)
  var actionContentColor by mutableStateOf(0)

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    // Fabric measures the replacement bar before attaching it on a fold.
    // Compose needs an attached window to obtain its lifecycle recomposer.
    if (!isAttachedToWindow) {
      setMeasuredDimension(
        MeasureSpec.getSize(widthMeasureSpec),
        MeasureSpec.getSize(heightMeasureSpec)
      )
      return
    }
    super.onMeasure(widthMeasureSpec, heightMeasureSpec)
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    if (isAttachedToWindow) super.onLayout(changed, left, top, right, bottom)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    requestLayout()
  }

  init {
    addView(
      ComposeView(context).apply {
        setViewCompositionStrategy(
          ViewCompositionStrategy.DisposeOnDetachedFromWindowOrReleasedFromPool
        )
        setContent {
          MaterialTheme(colorScheme = if (dark) darkColorScheme() else lightColorScheme()) {
            if (rail) {
              rail()
            } else {
              NavigationBar(
                modifier = Modifier.fillMaxSize(),
                containerColor = Color(containerColor),
                tonalElevation = androidx.compose.ui.unit.Dp(0f),
                windowInsets = WindowInsets(0),
              ) {
                TABS.forEach { tab ->
                  NavigationBarItem(
                    selected = selectedTab == tab,
                    onClick = { onTabSelected(mapOf("tab" to tab)) },
                    icon = { tabIcon(tab) },
                    label = { Text(tabTitle(tab), fontSize = (12 * textScale).sp) },
                    colors = NavigationBarItemDefaults.colors(
                      selectedIconColor = Color(selectedColor),
                      selectedTextColor = Color(selectedColor),
                      indicatorColor = Color(indicatorColor),
                      unselectedIconColor = Color(unselectedColor),
                      unselectedTextColor = Color(unselectedColor),
                    ),
                  )
                }
              }
            }
          }
        }
      },
      LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    )
  }

  @Composable
  private fun rail() {
    val railState = rememberWideNavigationRailState()
    val scope = rememberCoroutineScope()
    // ModalWideNavigationRail only widens its modal copy once its own position animation
    // passes 0.3; mirroring that gate keeps the labels and the FAB from expanding before the
    // container does. Collapsing starts at once so they finish before the modal window closes.
    val opening = railState.targetValue == WideNavigationRailValue.Expanded
    val modalProgress by animateFloatAsState(
      targetValue = if (opening) 1f else 0f,
      animationSpec = MaterialTheme.motionScheme.defaultEffectsSpec(),
    )
    val expanding = opening && modalProgress >= MODAL_EXPANDED_THRESHOLD
    // The header and items compose twice: in the inline rail that stays under the scrim and in
    // the modal's dialog window. Only the dialog copy may expand, or the inline rail reflows.
    val hostView = LocalView.current
    ModalWideNavigationRail(
      modifier = Modifier.fillMaxHeight(),
      state = railState,
      expandedHeaderTopPadding = safeAreaTop.dp,
      contentPadding = PaddingValues(bottom = 12.dp),
      header = {
        railHeader(railState, expanding && LocalView.current !== hostView, scope)
      },
      colors = WideNavigationRailDefaults.colors(
        containerColor = Color(containerColor),
        contentColor = Color(unselectedColor),
        modalContainerColor = Color(containerColor),
        modalContentColor = Color(unselectedColor),
      ),
      windowInsets = WindowInsets(0),
      // Menu and New thread stay top-aligned while destinations center like Material's rail.
      arrangement = Arrangement.Center,
    ) {
      railItems(railState, expanding && LocalView.current !== hostView, scope)
    }
  }

  @Composable
  private fun railHeader(
    railState: WideNavigationRailState,
    expanded: Boolean,
    scope: CoroutineScope
  ) {
    Column(
      modifier = Modifier.padding(start = 20.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      // As tall as the list toolbar so the menu lines up with the toolbar's actions.
      Box(Modifier.height(headerHeight.dp), contentAlignment = Alignment.CenterStart) {
        IconButton(
          onClick = { scope.launch { railState.toggle() } },
          modifier = Modifier.padding(start = 4.dp).semantics {
            contentDescription =
              if (expanded) "Collapse navigation rail" else "Expand navigation rail"
          },
        ) {
          Icon(
            painterResource(R.drawable.t3_menu),
            contentDescription = null,
            tint = Color(unselectedColor)
          )
        }
      }
      ExtendedFloatingActionButton(
        onClick = {
          if (newEnabled) {
            scope.launch {
              railState.collapse()
              onNewThread(emptyMap<String, Any>())
            }
          }
        },
        expanded = expanded,
        icon = { Icon(painterResource(R.drawable.t3_new_thread), contentDescription = null) },
        text = { Text("New thread") },
        modifier = Modifier.height(56.dp).alpha(if (newEnabled) 1f else DISABLED_ALPHA).semantics {
          contentDescription = "New thread"
          if (!newEnabled) disabled()
        },
        containerColor = Color(actionColor),
        contentColor = Color(actionContentColor),
      )
    }
  }

  @Composable
  private fun railItems(
    railState: WideNavigationRailState,
    expanded: Boolean,
    scope: CoroutineScope
  ) {
    // The collapsed rail shows icons only. Material does not animate an item between having no
    // label and having one, so the label always exists and grows from zero size on the item's
    // own spatial spring, while the collapsed indicator pads the icon to the same circle as an
    // unlabelled item. The circle then stretches into the expanded pill without a jump.
    val labelProgress by animateFloatAsState(
      targetValue = if (expanded) 1f else 0f,
      animationSpec = MaterialTheme.motionScheme.defaultSpatialSpec(),
    )
    val indicatorPadding = WideNavigationRailItemDefaults.indicatorPadding(
      railExpanded = expanded,
      collapsedPadding = PaddingValues(ICON_ONLY_INDICATOR_PADDING),
    )
    TABS.forEach { tab ->
      WideNavigationRailItem(
        selected = selectedTab == tab,
        onClick = {
          scope.launch {
            railState.collapse()
            onTabSelected(mapOf("tab" to tab))
          }
        },
        railExpanded = expanded,
        // Accessibility skips the zero-sized label, so the icon names the collapsed item.
        icon = { tabIcon(tab, if (expanded) null else expandedTabTitle(tab)) },
        label = {
          Text(
            expandedTabTitle(tab),
            Modifier
              .layout { measurable, constraints ->
                val placeable = measurable.measure(constraints)
                // Full size by the time the label appears, so the rail never clips it.
                val scale = (labelProgress / LABEL_SHOW_PROGRESS).coerceIn(0f, 1f)
                layout(
                  (placeable.width * scale).roundToInt(),
                  (placeable.height * scale).roundToInt(),
                ) {
                  placeable.place(0, 0)
                }
              }
              // Material draws the label opaque under the icon at rest and slides it across the
              // icon after the spring's midpoint, so it stays hidden until then and fades in.
              .graphicsLayer {
                alpha = ((labelProgress - LABEL_SHOW_PROGRESS) / LABEL_FADE_SPAN).coerceIn(0f, 1f)
              },
            fontSize = (14 * textScale).sp,
          )
        },
        indicatorPadding = indicatorPadding,
        colors = WideNavigationRailItemDefaults.colors(
          selectedIconColor = Color(selectedColor),
          selectedTextColor = Color(selectedColor),
          selectedIndicatorColor = Color(indicatorColor),
          unselectedIconColor = Color(unselectedColor),
          unselectedTextColor = Color(unselectedColor),
        ),
      )
    }
  }

  private fun tabTitle(tab: String) = when (tab) {
    "threads" -> "Chats"
    "pullRequests" -> "PRs"
    else -> "Settings"
  }

  private fun expandedTabTitle(tab: String) =
    if (tab == "pullRequests") "Pull Requests" else tabTitle(tab)

  @Composable
  private fun tabIcon(tab: String, contentDescription: String? = null) {
    val drawable = when (tab) {
      "threads" -> R.drawable.t3_chats
      "pullRequests" -> R.drawable.t3_pull_requests
      else -> R.drawable.t3_settings
    }
    // A visible label names the destination, so only an icon-only item needs a description.
    Icon(painter = painterResource(drawable), contentDescription = contentDescription)
  }

  private companion object {
    const val MODAL_EXPANDED_THRESHOLD = 0.3f
    const val LABEL_SHOW_PROGRESS = 0.5f
    const val LABEL_FADE_SPAN = 0.35f

    // Material's padding for an unlabelled rail item, which makes its indicator a circle.
    val ICON_ONLY_INDICATOR_PADDING = 16.dp
    const val DISABLED_ALPHA = 0.4f
  }
}
